import crypto from 'node:crypto';
import { head, get, put, del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { getAccount, saveAccount, listAccounts, accountByUsername, publicProfile, isBanned, readBlobJson } from '../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../lib/session.js';
import { listPosts, getPost, savePost, createPost, deletePost, REACTIONS } from '../lib/wall.js';
import { check, punish, hasAI, log, label } from '../lib/moderation.js';
import { isPlus, billingOn, PRICE_CENTS, createCheckout, confirmCheckout, refreshPlus, portalUrl } from '../lib/billing.js';
import { createTip, listTips, getTip, saveTip, deleteTip } from '../lib/tips.js';
import { listAds, isLive, saveAd, getAd, deleteAd, bump, publicAd } from '../lib/ads.js';
import { queryOf } from '../lib/query.js';

// The members community, in one function (the Hobby plan caps the site at 12).
//
// GET  ?view=wall&tab=latest|top|media|saved[&tag=x][&q=text]
// GET  ?view=post&id=           one post with its replies
// GET  ?view=profile&u=         a member's profile (only once they've posted)
// GET  ?view=notifications      your notifications
// GET  ?view=members            OWNER ONLY
// GET  ?media=<pathname>        serve an attachment (members only)
// POST ?upload=1                Blob client-upload token
// POST { action: post | react | delete | report | restore | reply | deleteReply | save | pin | vote | readNotifications }
//
// Privacy rules: nobody but the owner can list members or see sign-up counts;
// reactions and poll votes are counts only (never who); a profile can't be
// opened until that person has posted.

const POST_GAP_MS = 20 * 1000;
const REPLY_GAP_MS = 8 * 1000;
const REPORTS_TO_HIDE = 3;
const MAX_MEDIA = 4;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const FILE_TYPES = ['application/pdf'];
const LIMITS = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024, file: 20 * 1024 * 1024 };
const PIN_KEY = 'wall-meta/pinned.json';

function kindOf(type) {
  if (IMAGE_TYPES.includes(type)) return 'image';
  if (VIDEO_TYPES.includes(type)) return 'video';
  if (FILE_TYPES.includes(type)) return 'file';
  return null;
}

function cleanText(value, max = 500) {
  return String(value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function tagsOf(text) {
  return [...new Set((String(text || '').match(/(^|\s)#([a-z0-9_]{2,30})/gi) || []).map(t => t.trim().slice(1).toLowerCase()))];
}

function mentionsOf(text) {
  return [...new Set((String(text || '').match(/(^|[^\w])@([a-z0-9_]{3,20})\b/gi) || []).map(m => m.replace(/^[^@]*@/, '').toLowerCase()))];
}

function mini(account) {
  const p = account.profile || {};
  return { username: account.username, name: account.name, picture: account.picture || '', avatar: p.avatar || '', theme: p.theme || 'silver', title: p.title || 'Member', plus: isPlus(account) };
}

async function authorsFor(names) {
  const map = {};
  await Promise.all([...new Set(names)].map(async n => { const a = await accountByUsername(n).catch(() => null); if (a && a.username) map[n] = mini(a); }));
  return map;
}

function canMedia(account, admin) { return admin || account.mediaAccess === 'granted'; }

function score(post) {
  return Object.values(post.reactions || {}).reduce((n, who) => n + who.length, 0) + 2 * (post.replies || []).length;
}

async function pinnedId() {
  try { const d = await readBlobJson(PIN_KEY); return d && d.id; } catch { return null; }
}

function shape(post, me, admin, saved = [], pinned = null, lookup = null) {
  const reactions = {};
  for (const e of REACTIONS) {
    const who = (post.reactions && post.reactions[e]) || [];
    reactions[e] = { count: who.length, mine: who.includes(me) };
  }
  const poll = post.poll ? {
    options: post.poll.options.map(o => ({ text: o.text, count: o.votes.length })),
    total: post.poll.options.reduce((n, o) => n + o.votes.length, 0),
    mine: post.poll.options.findIndex(o => o.votes.includes(me))
  } : null;
  return {
    id: post.id, author: post.author, text: post.text, createdAt: post.createdAt, reactions, poll,
    media: (post.media || []).map(m => ({ kind: m.kind, name: m.name, size: m.size, url: '/api/community?media=' + encodeURIComponent(m.pathname) })),
    replyCount: (post.replies || []).length,
    repostCount: (post.reposts || []).length,
    reposted: (post.reposts || []).includes(me),
    editedAt: post.editedAt || null,
    repostOf: post.repostOf || null,
    quoteOf: post.quoteOf || null,
    embed: lookup && (post.repostOf || post.quoteOf) ? (() => { const o = lookup[post.repostOf || post.quoteOf]; return o ? shape(o, me, admin, saved, pinned, null) : { missing: true }; })() : undefined,
    canDelete: admin || post.author === me,
    reported: (post.reports || []).includes(me),
    saved: saved.includes(post.id),
    pinned: pinned === post.id,
    hidden: !!post.hidden,
    ...(admin ? { reports: (post.reports || []).length, authorEmail: post.email } : {})
  };
}

function shapeReply(r, me, admin) {
  return { id: r.id, author: r.author, text: r.text, createdAt: r.createdAt, canDelete: admin || r.author === me, ...(admin ? { authorEmail: r.email } : {}) };
}

// Notifications live on the recipient's account (newest first, max 60).
// Reactions are grouped into a count and never say who reacted.
async function notify(username, note, skip) {
  if (!username || username === skip) return;
  const account = await accountByUsername(username).catch(() => null);
  if (!account) return;
  const inbox = account.inbox || [];
  if (note.type === 'react') {
    const existing = inbox.find(n => n.type === 'react' && n.postId === note.postId && !n.read);
    if (existing) { existing.count = (existing.count || 1) + 1; existing.at = new Date().toISOString(); account.inbox = inbox; return saveAccount(account); }
    note.count = 1;
  }
  account.inbox = [{ ...note, at: new Date().toISOString(), read: false }, ...inbox].slice(0, 60);
  await saveAccount(account);
}

async function blobToDataUrl(pathname, type) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) throw new Error('Upload not found');
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  return `data:${type};base64,${buf.toString('base64')}`;
}

async function serveMedia(req, res, pathname) {
  if (!/^(wall-media\/[a-z0-9_]{3,20}|ads-media|anon-tips-media)\/[\w.\-]+$/.test(pathname)) return res.status(400).end();
  const headers = req.headers.range ? { range: req.headers.range } : undefined;
  const r = await get(pathname, { access: 'private', headers }).catch(() => null);
  if (!r || !r.stream) return res.status(404).end();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = r.headers.get(h); if (v) res.setHeader(h, v);
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (r.blob?.contentType === 'application/pdf') res.setHeader('Content-Disposition', 'inline');
  res.status(r.headers.get('content-range') ? 206 : 200);
  const reader = r.stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
  return res.end();
}

async function lookupFor(posts, pool) {
  const ids = [...new Set(posts.map(p => p.repostOf || p.quoteOf).filter(Boolean))];
  const map = {};
  for (const id of ids) map[id] = (pool || []).find(p => p.id === id) || await getPost(id);
  return map;
}

function trending(posts) {
  const week = Date.now() - 7 * 864e5, counts = {};
  for (const p of posts) if (!p.hidden && Date.parse(p.createdAt) > week) for (const t of tagsOf(p.text)) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }));
}

export default async function handler(req, res) {
  const query = queryOf(req);
  res.setHeader('Cache-Control', 'no-store');
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  const me = await getAccount(session.email);
  if (!me || !me.username || await isBanned(me.email)) return res.status(403).json({ error: 'Not allowed' });
  const admin = isAdmin(session);
  try { const fresh = await refreshPlus(me); if (fresh) { me.plus = fresh; await saveAccount(me); } } catch (e) {}
  const plus = isPlus(me);
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const visible = p => !p.hidden || admin || p.author === me.username;
  const hiddenAuthors = new Set([...(me.blocked || []), ...(me.muted || [])]);
  // Posts from people I blocked/muted, and from people who blocked me, are not shown to me.
  async function blockedMe(names) {
    const out = new Set();
    await Promise.all([...new Set(names)].map(async n => { const a = await accountByUsername(n).catch(() => null); if (a && (a.blocked || []).includes(me.username)) out.add(n); }));
    return out;
  }

  if (req.method === 'GET' && query.media) {
    if (String(query.media).startsWith('anon-tips-media/') && !admin) return res.status(403).end();
    return serveMedia(req, res, String(query.media));
  }

  if (req.method === 'GET') {
    const view = String(query.view || 'wall');

    if (view === 'wall') {
      const tab = String(query.tab || 'latest');
      const tag = String(query.tag || '').toLowerCase().replace(/^#/, '');
      const q = String(query.q || '').toLowerCase().trim().slice(0, 60);
      const pool = (await listPosts(150)).filter(visible);
      const pin = await pinnedId();
      let posts;
      if (tab === 'saved') {
        posts = (await Promise.all((me.saved || []).slice(-60).reverse().map(id => getPost(id)))).filter(p => p && visible(p));
      } else if (tab === 'top') {
        const week = Date.now() - 7 * 864e5;
        posts = pool.filter(p => !p.repostOf && Date.parse(p.createdAt) > week).sort((a, b) => score(b) - score(a));
      } else if (tab === 'media') {
        posts = pool.filter(p => !p.repostOf && (p.media || []).length);
      } else if (tab === 'following') {
        const f = new Set([...(me.following || []), me.username]);
        posts = pool.filter(p => f.has(p.author));
      } else {
        posts = pool;
      }
      if (tag) posts = posts.filter(p => tagsOf(p.text).includes(tag));
      if (q) posts = posts.filter(p => (p.text || '').toLowerCase().includes(q) || p.author.includes(q.replace(/^@/, '')));
      if (!admin) {
        const by = await blockedMe(posts.map(p => p.author));
        posts = posts.filter(p => !hiddenAuthors.has(p.author) && !by.has(p.author));
      }
      posts = posts.slice(0, 50);
      if (tab === 'latest' && !tag && !q && pin) {
        const pinnedPost = pool.find(p => p.id === pin) || await getPost(pin);
        if (pinnedPost && visible(pinnedPost)) posts = [pinnedPost, ...posts.filter(p => p.id !== pin)];
      }
      const lookup = await lookupFor(posts, pool);
      const embedAuthors = Object.values(lookup).filter(Boolean).map(p => p.author);
      return res.status(200).json({
        ads: plus ? [] : (await listAds().catch(() => [])).filter(a => isLive(a)).map(publicAd),
        plusInfo: { on: billingOn(), price: PRICE_CENTS() },
        me: mini(me), admin, mediaEnabled: hasAI(), mediaAccess: admin ? 'granted' : (me.mediaAccess || 'none'), reactions: REACTIONS,
        following: (me.following || []).length,
        unread: (me.inbox || []).filter(n => !n.read).length,
        trending: trending(pool),
        authors: await authorsFor([...posts.map(p => p.author), ...embedAuthors]),
        posts: posts.map(p => shape(p, me.username, admin, me.saved || [], pin, lookup))
      });
    }

    if (view === 'post') {
      const post = await getPost(String(query.id || ''));
      if (!post || !visible(post)) return res.status(404).json({ error: 'Post not found' });
      const replies = (post.replies || []).map(r => shapeReply(r, me.username, admin));
      const lk = await lookupFor([post]);
      return res.status(200).json({
        me: mini(me), admin, reactions: REACTIONS,
        authors: await authorsFor([post.author, ...replies.map(r => r.author), ...Object.values(lk).filter(Boolean).map(p => p.author)]),
        post: shape(post, me.username, admin, me.saved || [], await pinnedId(), lk), replies
      });
    }

    if (view === 'notifications') {
      const inbox = (me.inbox || []).slice(0, 60);
      return res.status(200).json({ notifications: inbox, authors: await authorsFor(inbox.map(n => n.from).filter(Boolean)) });
    }

    if (view === 'profile') {
      const account = await accountByUsername(query.u);
      const notFound = () => res.status(404).json({ error: 'No member with that username' });
      if (!account || !account.username) return notFound();
      const all = (await listPosts(150)).filter(p => p.author === account.username);
      const isSelf = account.username === me.username;
      if (!admin && !isSelf && !all.some(p => !p.hidden)) return notFound();
      if (!admin && (account.blocked || []).includes(me.username)) return notFound();
      const posts = all.filter(visible).slice(0, 30);
      const pin = await pinnedId();
      const profLookup = await lookupFor(posts);
      const embedAuthors2 = await authorsFor(Object.values(profLookup).filter(Boolean).map(p => p.author));
      const out = {
        authors: embedAuthors2,
        me: me.username, admin, reactions: REACTIONS, profile: publicProfile(account),
        stats: { posts: posts.length, reactions: posts.reduce((n, p) => n + score(p), 0), followers: (account.followers || []).length, following: (account.following || []).length },
        relation: { following: (me.following || []).includes(account.username), followsYou: (account.following || []).includes(me.username), blocked: (me.blocked || []).includes(account.username), muted: (me.muted || []).includes(account.username) },
        posts: posts.map(p => shape(p, me.username, admin, me.saved || [], pin, profLookup))
      };
      if (admin) { out.email = account.email; out.strikes = account.strikes || 0; }
      return res.status(200).json(out);
    }

    if (view === 'network') {
      // Only you can see who follows you and who you follow.
      const which = query.list === 'followers' ? (me.followers || []) : query.list === 'blocked' ? [...new Set([...(me.blocked || []), ...(me.muted || [])])] : (me.following || []);
      const authors = await authorsFor(which.slice(0, 300));
      return res.status(200).json({ list: which.filter(n => authors[n]).map(n => ({ ...authors[n], blocked: (me.blocked || []).includes(n), muted: (me.muted || []).includes(n), following: (me.following || []).includes(n) })) });
    }

    if (view === 'plus') {
      return res.status(200).json({
        on: billingOn(), price: PRICE_CENTS(), member: plus,
        plus: me.plus ? { status: me.plus.comp ? 'gift' : me.plus.status, periodEnd: me.plus.periodEnd || null, cancelAtPeriodEnd: !!me.plus.cancelAtPeriodEnd, since: me.plus.since || null, comp: !!me.plus.comp } : null
      });
    }

    if (view === 'tips') {
      if (!admin) return res.status(403).json({ error: 'Owner only' });
      const tips = await listTips();
      return res.status(200).json({ tips: tips.map(t => ({ ...t, files: (t.files || []).map(f => ({ name: f.name, kind: f.kind, size: f.size, url: '/api/community?media=' + encodeURIComponent(f.pathname) })) })) });
    }

    if (view === 'ads') {
      if (!admin) return res.status(403).json({ error: 'Owner only' });
      return res.status(200).json({ ads: (await listAds()).map(a => ({ ...a, imageUrl: a.image ? '/api/community?media=' + encodeURIComponent(a.image) : '', live: isLive(a) })) });
    }

    if (view === 'members') {
      if (!admin) return res.status(403).json({ error: 'Owner only' });
      const members = (await listAccounts()).filter(a => a.username)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 200).map(a => ({ ...mini(a), createdAt: a.createdAt }));
      return res.status(200).json({ members, total: members.length });
    }
    return res.status(400).json({ error: 'Unknown view' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (query.upload) {
    if (!hasAI() && !admin && !String(req.body?.payload?.pathname || '').startsWith('anon-tips-media/')) return res.status(403).json({ error: 'Photo and video uploads switch on once automatic moderation is set up.' });
    const mediaOk = canMedia(me, admin);
    try {
      const json = await handleUpload({
        body: req.body, request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (pathname.startsWith('anon-tips-media/')) return { allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES, ...FILE_TYPES, 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'text/plain'], maximumSizeInBytes: LIMITS.video, addRandomSuffix: true };
          if (admin && pathname.startsWith('ads-media/')) return { allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: LIMITS.image, addRandomSuffix: true };
          if (!pathname.startsWith(`wall-media/${me.username}/`)) throw new Error('Bad upload path');
          return mediaOk
            ? { allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES, ...FILE_TYPES], maximumSizeInBytes: LIMITS.video, addRandomSuffix: true }
            : { allowedContentTypes: FILE_TYPES, maximumSizeInBytes: LIMITS.file, addRandomSuffix: true };
        },
        onUploadCompleted: async () => {}
      });
      return res.status(200).json(json);
    } catch (err) {
      return res.status(400).json({ error: String((err && err.message) || err) });
    }
  }

  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const action = req.body?.action;

  async function blocked(verdict, text, extra = {}) {
    // Banned words: the post is simply refused, no strike.
    if (verdict.categories.every(c => c === 'blocklist')) {
      await log({ action: 'blocked', username: me.username, email: me.email, reason: 'banned words', text: text.slice(0, 200) });
      return res.status(422).json({ error: 'That contains a word that isn’t allowed on JAVISREVENGE. Remove it and try again.' });
    }
    const result = admin ? { banned: false, strikes: 0 } : await punish(me, verdict.categories, { text: text.slice(0, 200), ...extra });
    if (admin) await log({ action: 'blocked', username: me.username, email: me.email, reason: label(verdict.categories), text: text.slice(0, 200) });
    return res.status(422).json({
      error: result.banned
        ? 'This broke the rules and your account has been banned automatically.'
        : `Blocked for ${label(verdict.categories)}.`,
      banned: result.banned
    });
  }

  if (action === 'post') {
    const text = cleanText(req.body.text, plus || admin ? 1000 : 500);
    const wanted = Array.isArray(req.body.media) ? req.body.media.slice(0, MAX_MEDIA) : [];
    let poll = null;
    if (Array.isArray(req.body.poll)) {
      const opts = req.body.poll.map(o => cleanText(o, 60)).filter(Boolean).slice(0, 4);
      if (opts.length >= 2) poll = { options: opts.map(t => ({ text: t, votes: [] })) };
    }
    let quoteOf = null;
    if (req.body.quoteOf) {
      const q = await getPost(String(req.body.quoteOf));
      if (!q || !visible(q)) return res.status(400).json({ error: 'The post you are quoting no longer exists.' });
      quoteOf = q.repostOf || q.id;
    }
    if (!text && !wanted.length) return res.status(400).json({ error: 'Write something or add a photo first.' });
    if (!admin && me.lastPostAt && Date.now() - Date.parse(me.lastPostAt) < POST_GAP_MS) {
      return res.status(429).json({ error: 'Slow down — wait a few seconds between posts.' });
    }
    const media = [];
    for (const w of wanted) {
      const pathname = String(w?.pathname || '');
      if (!pathname.startsWith(`wall-media/${me.username}/`)) return res.status(400).json({ error: 'Invalid upload' });
      const info = await head(pathname).catch(() => null);
      const kind = info && kindOf(info.contentType);
      if (!kind) return res.status(400).json({ error: 'That file type is not allowed.' });
      if (info.size > LIMITS[kind]) return res.status(400).json({ error: `That ${kind} is too large.` });
      if ((kind === 'image' || kind === 'video') && !canMedia(me, admin)) {
        await del(pathname).catch(() => {});
        return res.status(403).json({ error: 'Photo and video posting is only for members the owner has approved. You can request access from your account.' });
      }
      media.push({ pathname, kind, type: info.contentType, size: info.size, name: String(w.name || '').slice(0, 80) });
    }
    if (media.length && !hasAI()) return res.status(403).json({ error: 'Uploads are switched off until automatic moderation is set up.' });

    const images = [];
    for (const m of media) if (m.kind === 'image' && m.type !== 'image/gif') images.push(await blobToDataUrl(m.pathname, m.type));
    const frames = (Array.isArray(req.body.frames) ? req.body.frames : []).filter(f => /^data:image\/jpeg;base64,/.test(f) && f.length < 400000).slice(0, 8);
    if (media.some(m => m.kind === 'video') && !frames.length) return res.status(400).json({ error: 'Could not read that video. Try a different file.' });
    images.push(...frames);
    const checkText = [text, media.map(m => m.name).join(' '), poll ? poll.options.map(o => o.text).join(' ') : ''].filter(Boolean).join('\n');

    let verdict;
    try { verdict = await check({ text: checkText, images }); }
    catch { return res.status(503).json({ error: 'The safety check is unavailable right now. Try again in a minute.' }); }
    if (!verdict.ok) {
      for (const m of media) await del(m.pathname).catch(() => {});
      return blocked(verdict, text, { media: media.length });
    }

    const post = await createPost(me, text, media);
    if (poll || quoteOf) { if (poll) post.poll = poll; if (quoteOf) post.quoteOf = quoteOf; await savePost(post); }
    if (quoteOf) { const q = await getPost(quoteOf); if (q) await notify(q.author, { type: 'quote', from: me.username, postId: post.id, text: text.slice(0, 120) }, me.username).catch(() => {}); }
    me.lastPostAt = post.createdAt;
    await saveAccount(me);
    for (const u of mentionsOf(text).slice(0, 10)) await notify(u, { type: 'mention', from: me.username, postId: post.id, text: text.slice(0, 120) }, me.username).catch(() => {});
    const lk = await lookupFor([post]);
    return res.status(200).json({ post: shape(post, me.username, admin, me.saved || [], null, lk), author: mini(me), authors: await authorsFor(Object.values(lk).filter(Boolean).map(p => p.author)) });
  }

  if (action === 'readNotifications') {
    const fresh = await getAccount(me.email);
    fresh.inbox = (fresh.inbox || []).map(n => ({ ...n, read: true }));
    await saveAccount(fresh);
    return res.status(200).json({ ok: true });
  }

  if (action === 'tip') {
    const text = cleanText(req.body.text, 5000);
    const wanted = Array.isArray(req.body.files) ? req.body.files.slice(0, 5) : [];
    if (!text && !wanted.length) return res.status(400).json({ error: 'Write something or attach a file.' });
    if (!admin && me.lastTipAt && Date.now() - Date.parse(me.lastTipAt) < 60 * 1000) return res.status(429).json({ error: 'Please wait a minute before sending another tip.' });
    const files = [];
    for (const w of wanted) {
      const pathname = String(w?.pathname || '');
      if (!/^anon-tips-media\/[\w.\-]+$/.test(pathname)) return res.status(400).json({ error: 'Invalid attachment' });
      const info = await head(pathname).catch(() => null);
      if (!info) return res.status(400).json({ error: 'An attachment failed to upload. Try again.' });
      files.push({ pathname, name: String(w.name || 'file').slice(0, 80), kind: kindOf(info.contentType) || 'file', size: info.size });
    }
    await createTip(text, files);
    // Only remember when (not what) for the 1-per-minute limit.
    const fresh = await getAccount(me.email); fresh.lastTipAt = new Date().toISOString(); await saveAccount(fresh);
    // Let the owner know a tip arrived — without saying who sent it.
    for (const email of String(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)) {
      const owner = await getAccount(email).catch(() => null);
      if (owner) { owner.inbox = [{ type: 'tip', at: new Date().toISOString(), read: false }, ...(owner.inbox || [])].slice(0, 60); await saveAccount(owner).catch(() => {}); }
    }
    return res.status(200).json({ sent: true });
  }
  if (action === 'tipRead' || action === 'tipDelete') {
    if (!admin) return res.status(403).json({ error: 'Owner only' });
    if (action === 'tipDelete') { await deleteTip(String(req.body.tipId)); return res.status(200).json({ deleted: true }); }
    const t = await getTip(String(req.body.tipId)); if (t) { t.read = true; await saveTip(t); }
    return res.status(200).json({ ok: true });
  }

  if (action === 'checkout') {
    if (!billingOn()) return res.status(503).json({ error: 'REVENGE+ isn’t open yet. Check back soon.' });
    if (plus) return res.status(400).json({ error: 'You’re already a REVENGE+ member.' });
    try { return res.status(200).json({ url: await createCheckout(me, origin) }); }
    catch (e) { return res.status(502).json({ error: e.message }); }
  }
  if (action === 'confirmPlus') {
    try {
      const fresh = await getAccount(me.email);
      fresh.plus = await confirmCheckout(fresh, req.body.sessionId);
      await saveAccount(fresh);
      return res.status(200).json({ member: isPlus(fresh) });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  if (action === 'portal') {
    try { return res.status(200).json({ url: await portalUrl(me, origin) }); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  if (action === 'adSeen' || action === 'adClick') {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).map(String);
    await bump(ids, action === 'adSeen' ? 'impressions' : 'clicks').catch(() => {});
    return res.status(200).json({ ok: true });
  }
  if (action === 'saveAd' || action === 'deleteAd' || action === 'toggleAd') {
    if (!admin) return res.status(403).json({ error: 'Owner only' });
    const existing = req.body.adId ? await getAd(req.body.adId) : null;
    if (action === 'deleteAd') { if (existing) await deleteAd(existing.id); return res.status(200).json({ deleted: true }); }
    if (action === 'toggleAd') { if (!existing) return res.status(404).json({ error: 'Ad not found' }); const ad = await saveAd({ ...existing, active: !existing.active, startsAt: existing.startsAt, endsAt: existing.endsAt }, existing); return res.status(200).json({ ad }); }
    try { return res.status(200).json({ ad: await saveAd(req.body.ad || {}, existing) }); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }

  if (action === 'requestMedia') {
    const fresh = await getAccount(me.email);
    if (fresh.mediaAccess === 'granted') return res.status(200).json({ mediaAccess: 'granted' });
    fresh.mediaAccess = 'requested'; fresh.mediaRequestedAt = new Date().toISOString();
    await saveAccount(fresh);
    return res.status(200).json({ mediaAccess: 'requested' });
  }

  if (['follow', 'block', 'mute'].includes(action)) {
    const other = await accountByUsername(req.body?.username);
    if (!other || !other.username || other.username === me.username) return res.status(404).json({ error: 'Member not found' });
    const fresh = await getAccount(me.email);
    const toggle = (list, name) => { const s0 = new Set(list || []); const on = !s0.has(name); if (on) s0.add(name); else s0.delete(name); return [[...s0], on]; };
    if (action === 'follow') {
      if ((other.blocked || []).includes(me.username) || (fresh.blocked || []).includes(other.username)) return res.status(403).json({ error: "You can't follow this member." });
      const [list, on] = toggle(fresh.following, other.username);
      fresh.following = list.slice(-2000); await saveAccount(fresh);
      const [fl] = on ? [[...new Set([...(other.followers || []), me.username])]] : [(other.followers || []).filter(u => u !== me.username)];
      other.followers = fl; if (on) other.inbox = [{ type: 'follow', from: me.username, at: new Date().toISOString(), read: false }, ...(other.inbox || [])].slice(0, 60);
      await saveAccount(other);
      return res.status(200).json({ following: on, followers: other.followers.length });
    }
    if (action === 'block') {
      const [list, on] = toggle(fresh.blocked, other.username);
      fresh.blocked = list;
      if (on) {
        // Blocking also removes any follow in either direction.
        fresh.following = (fresh.following || []).filter(u => u !== other.username);
        fresh.followers = (fresh.followers || []).filter(u => u !== other.username);
        other.following = (other.following || []).filter(u => u !== me.username);
        other.followers = (other.followers || []).filter(u => u !== me.username);
        await saveAccount(other);
      }
      await saveAccount(fresh);
      return res.status(200).json({ blocked: on });
    }
    const [list, on] = toggle(fresh.muted, other.username);
    fresh.muted = list; await saveAccount(fresh);
    return res.status(200).json({ muted: on });
  }

  const post = await getPost(String(req.body?.id || ''));
  if (!post || !visible(post)) return res.status(404).json({ error: 'Post not found' });
  // People who blocked me: I can't reply to or react on their posts.
  if (!admin && ['react', 'reply', 'vote', 'repost'].includes(action)) {
    const author = await accountByUsername(post.author).catch(() => null);
    if (author && (author.blocked || []).includes(me.username)) return res.status(403).json({ error: 'You can’t interact with this post.' });
  }

  if (action === 'repost') {
    const target = post.repostOf ? await getPost(post.repostOf) : post;
    if (!target) return res.status(404).json({ error: 'Post not found' });
    if (target.author === me.username) return res.status(400).json({ error: "You can't repost your own post." });
    const who = new Set(target.reposts || []);
    const on = !who.has(me.username);
    if (on) {
      who.add(me.username);
      const r = await createPost(me, '', []);
      r.repostOf = target.id; await savePost(r);
      await notify(target.author, { type: 'repost', from: me.username, postId: target.id, text: String(target.text || '').slice(0, 80) }, me.username).catch(() => {});
    } else {
      who.delete(me.username);
      const mine = (await listPosts(300)).filter(p => p.author === me.username && p.repostOf === target.id);
      for (const m of mine) await deletePost(m.id);
    }
    target.reposts = [...who];
    await savePost(target);
    return res.status(200).json({ reposted: on, repostCount: target.reposts.length, id: target.id });
  }

  if (action === 'edit') {
    if (post.author !== me.username) return res.status(403).json({ error: 'You can only edit your own posts.' });
    if (post.repostOf) return res.status(400).json({ error: 'Reposts can’t be edited.' });
    if (!admin && Date.now() - Date.parse(post.createdAt) > 60 * 60 * 1000) return res.status(400).json({ error: 'Posts can only be edited for 1 hour after posting.' });
    const text = cleanText(req.body.text, plus || admin ? 1000 : 500);
    if (!text && !(post.media || []).length) return res.status(400).json({ error: 'A post can’t be empty.' });
    let verdict;
    try { verdict = await check({ text }); } catch { return res.status(503).json({ error: 'The safety check is unavailable right now.' }); }
    if (!verdict.ok) return blocked(verdict, text, { edit: true });
    post.history = [...(post.history || []), { text: post.text, at: post.editedAt || post.createdAt }].slice(-10);
    post.text = text; post.editedAt = new Date().toISOString();
    await savePost(post);
    return res.status(200).json({ post: shape(post, me.username, admin, me.saved || [], await pinnedId(), await lookupFor([post])) });
  }

  if (action === 'react') {
    const emoji = String(req.body.emoji || '');
    if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: 'Unknown reaction' });
    post.reactions = post.reactions || {};
    const who = new Set(post.reactions[emoji] || []);
    const adding = !who.has(me.username);
    if (adding) who.add(me.username); else who.delete(me.username);
    post.reactions[emoji] = [...who];
    await savePost(post);
    if (adding) await notify(post.author, { type: 'react', emoji, postId: post.id, text: String(post.text || '').slice(0, 80) }, me.username).catch(() => {});
    return res.status(200).json({ post: shape(post, me.username, admin, me.saved || [], await pinnedId(), await lookupFor([post])) });
  }

  if (action === 'vote') {
    if (!post.poll) return res.status(400).json({ error: 'No poll on this post' });
    const i = Number(req.body.option);
    if (!(i >= 0 && i < post.poll.options.length)) return res.status(400).json({ error: 'Bad option' });
    for (const o of post.poll.options) o.votes = o.votes.filter(u => u !== me.username);
    post.poll.options[i].votes.push(me.username);
    await savePost(post);
    return res.status(200).json({ post: shape(post, me.username, admin, me.saved || [], await pinnedId(), await lookupFor([post])) });
  }

  if (action === 'save') {
    const fresh = await getAccount(me.email);
    const saved = new Set(fresh.saved || []);
    if (saved.has(post.id)) saved.delete(post.id); else saved.add(post.id);
    fresh.saved = [...saved].slice(-300);
    await saveAccount(fresh);
    return res.status(200).json({ saved: saved.has(post.id) });
  }

  if (action === 'reply') {
    const text = cleanText(req.body.text, plus || admin ? 600 : 300);
    if (!text) return res.status(400).json({ error: 'Write a reply first.' });
    if (!admin && me.lastReplyAt && Date.now() - Date.parse(me.lastReplyAt) < REPLY_GAP_MS) return res.status(429).json({ error: 'Slow down a little.' });
    if ((post.replies || []).length >= 300) return res.status(400).json({ error: 'This thread is full.' });
    let verdict;
    try { verdict = await check({ text }); } catch { return res.status(503).json({ error: 'The safety check is unavailable right now.' }); }
    if (!verdict.ok) return blocked(verdict, text, { reply: true });
    const reply = { id: crypto.randomBytes(4).toString('hex'), author: me.username, email: me.email, text, createdAt: new Date().toISOString() };
    post.replies = [...(post.replies || []), reply];
    await savePost(post);
    me.lastReplyAt = reply.createdAt; await saveAccount(me);
    await notify(post.author, { type: 'reply', from: me.username, postId: post.id, text: text.slice(0, 120) }, me.username).catch(() => {});
    for (const u of mentionsOf(text).slice(0, 10)) if (u !== post.author) await notify(u, { type: 'mention', from: me.username, postId: post.id, text: text.slice(0, 120) }, me.username).catch(() => {});
    return res.status(200).json({ reply: shapeReply(reply, me.username, admin), author: mini(me), replyCount: post.replies.length });
  }

  if (action === 'deleteReply') {
    const r = (post.replies || []).find(x => x.id === req.body.rid);
    if (!r) return res.status(404).json({ error: 'Reply not found' });
    if (!admin && r.author !== me.username) return res.status(403).json({ error: 'Not your reply' });
    post.replies = post.replies.filter(x => x.id !== r.id);
    await savePost(post);
    return res.status(200).json({ deleted: true, replyCount: post.replies.length });
  }

  if (action === 'pin') {
    if (!admin) return res.status(403).json({ error: 'Owner only' });
    const current = await pinnedId();
    if (current === post.id) await del(PIN_KEY).catch(() => {});
    else await put(PIN_KEY, JSON.stringify({ id: post.id }), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
    return res.status(200).json({ pinned: current !== post.id });
  }

  if (action === 'restore') {
    if (!admin) return res.status(403).json({ error: 'Owner only' });
    post.hidden = false; post.reports = [];
    await savePost(post);
    return res.status(200).json({ restored: true });
  }

  if (action === 'delete') {
    if (!admin && post.author !== me.username) return res.status(403).json({ error: 'Not your post' });
    await deletePost(post.id);
    if (await pinnedId() === post.id) await del(PIN_KEY).catch(() => {});
    return res.status(200).json({ deleted: true });
  }

  if (action === 'report') {
    if (post.author === me.username) return res.status(400).json({ error: "You can't report your own post" });
    post.reports = [...new Set([...(post.reports || []), me.username])];
    if (post.reports.length >= REPORTS_TO_HIDE && !post.hidden) {
      post.hidden = true;
      await log({ action: 'hidden', username: post.author, email: post.email, reason: `reported by ${post.reports.length} members`, text: String(post.text || '').slice(0, 200), postId: post.id });
    }
    await savePost(post);
    return res.status(200).json({ reported: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
