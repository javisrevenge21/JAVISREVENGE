import { head, get } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { getAccount, saveAccount, listAccounts, accountByUsername, publicProfile, isBanned } from '../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../lib/session.js';
import { listPosts, getPost, savePost, createPost, deletePost, REACTIONS } from '../lib/wall.js';
import { check, punish, hasAI, log, label } from '../lib/moderation.js';

// One function for the members community (the Hobby plan caps the site at 12):
//   GET  ?view=wall | profile&u= | members
//   GET  ?media=<pathname>         serve a Wall photo/video/PDF (members only)
//   POST ?upload=1                 Vercel Blob client-upload token (photos, videos, PDFs)
//   POST { action: 'post', text, media: [{pathname}], frames: [dataURL] }
//   POST { action: 'react' | 'delete' | 'report', id, emoji? }

const POST_GAP_MS = 20 * 1000;
const REPORTS_TO_HIDE = 3;
const MAX_MEDIA = 4;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const FILE_TYPES = ['application/pdf'];
const LIMITS = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024, file: 20 * 1024 * 1024 };

function kindOf(type) {
  if (IMAGE_TYPES.includes(type)) return 'image';
  if (VIDEO_TYPES.includes(type)) return 'video';
  if (FILE_TYPES.includes(type)) return 'file';
  return null;
}

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 500);
}

function mini(account) {
  const p = account.profile || {};
  return { username: account.username, name: account.name, picture: account.picture || '', avatar: p.avatar || '', theme: p.theme || 'silver', title: p.title || 'Member' };
}

async function authorsFor(posts) {
  const names = [...new Set(posts.map(p => p.author))];
  const map = {};
  await Promise.all(names.map(async n => { const a = await accountByUsername(n).catch(() => null); if (a) map[n] = mini(a); }));
  return map;
}

function shape(post, me, admin) {
  const ownerOnly = admin ? { authorEmail: post.email } : {};
  const reactions = {};
  for (const e of REACTIONS) {
    const who = (post.reactions && post.reactions[e]) || [];
    reactions[e] = { count: who.length, mine: !!me && who.includes(me) };
  }
  return {
    id: post.id, author: post.author, text: post.text, createdAt: post.createdAt, reactions,
    media: (post.media || []).map(m => ({ kind: m.kind, name: m.name, size: m.size, url: '/api/community?media=' + encodeURIComponent(m.pathname) })),
    canDelete: admin || post.author === me,
    hidden: !!post.hidden, reports: admin ? (post.reports || []).length : undefined,
    reported: (post.reports || []).includes(me),
    ...ownerOnly
  };
}

async function blobToDataUrl(pathname, type) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) throw new Error('Upload not found');
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  return `data:${type};base64,${buf.toString('base64')}`;
}

async function serveMedia(req, res, pathname) {
  if (!/^wall-media\/[a-z0-9_]{3,20}\/[\w.\-]+$/.test(pathname)) return res.status(400).end();
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  const me = await getAccount(session.email);
  if (!me || !me.username || await isBanned(me.email)) return res.status(403).json({ error: 'Not allowed' });
  const admin = isAdmin(session);

  if (req.method === 'GET' && req.query.media) return serveMedia(req, res, String(req.query.media));

  if (req.method === 'GET') {
    const view = String(req.query.view || 'wall');
    if (view === 'wall') {
      const posts = (await listPosts(60)).filter(p => !p.hidden || admin || p.author === me.username).slice(0, 40);
      return res.status(200).json({ me: mini(me), admin, mediaEnabled: hasAI(), reactions: REACTIONS, authors: await authorsFor(posts), posts: posts.map(p => shape(p, me.username, admin)) });
    }
    if (view === 'profile') {
      const account = await accountByUsername(req.query.u);
      // A profile is only visible once that person has posted something, so
      // browsing usernames can't reveal who has signed up. You can always see
      // your own, and the owner can see everyone's.
      const notFound = () => res.status(404).json({ error: 'No member with that username' });
      if (!account || !account.username) return notFound();
      const all = (await listPosts(200)).filter(p => p.author === account.username);
      const isSelf = account.username === me.username;
      if (!admin && !isSelf && !all.some(p => !p.hidden)) return notFound();
      const posts = all.filter(p => !p.hidden || admin || isSelf).slice(0, 20);
      const out = { me: me.username, admin, reactions: REACTIONS, profile: publicProfile(account), posts: posts.map(p => shape(p, me.username, admin)) };
      if (admin) { out.email = account.email; out.strikes = account.strikes || 0; }
      return res.status(200).json(out);
    }
    if (view === 'members') {
      // Who has signed up is private: only the owner can list members.
      if (!admin) return res.status(403).json({ error: 'Owner only' });
      const members = (await listAccounts()).filter(a => a.username)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 200).map(a => ({ ...mini(a), createdAt: a.createdAt }));
      return res.status(200).json({ members, total: members.length });
    }
    return res.status(400).json({ error: 'Unknown view' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Browser asks for a one-time token, then uploads straight to Blob storage.
  if (req.query.upload) {
    if (!hasAI()) return res.status(403).json({ error: 'Photo and video uploads switch on once automatic moderation is set up.' });
    try {
      const json = await handleUpload({
        body: req.body, request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(`wall-media/${me.username}/`)) throw new Error('Bad upload path');
          return { allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES, ...FILE_TYPES], maximumSizeInBytes: LIMITS.video, addRandomSuffix: true };
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

  if (action === 'post') {
    const text = cleanText(req.body.text);
    const wanted = Array.isArray(req.body.media) ? req.body.media.slice(0, MAX_MEDIA) : [];
    if (!text && !wanted.length) return res.status(400).json({ error: 'Write something or add a photo first.' });
    if (!admin && me.lastPostAt && Date.now() - Date.parse(me.lastPostAt) < POST_GAP_MS) {
      return res.status(429).json({ error: 'Slow down — wait a few seconds between posts.' });
    }

    // Verify every upload belongs to this person and is an allowed type and size.
    const media = [];
    for (const w of wanted) {
      const pathname = String(w?.pathname || '');
      if (!pathname.startsWith(`wall-media/${me.username}/`)) return res.status(400).json({ error: 'Invalid upload' });
      const info = await head(pathname).catch(() => null);
      const kind = info && kindOf(info.contentType);
      if (!kind) return res.status(400).json({ error: 'That file type is not allowed.' });
      if (info.size > LIMITS[kind]) return res.status(400).json({ error: `That ${kind} is too large.` });
      media.push({ pathname, kind, type: info.contentType, size: info.size, name: String(w.name || '').slice(0, 80) });
    }
    if (media.length && !hasAI()) return res.status(403).json({ error: 'Uploads are switched off until automatic moderation is set up.' });

    // Automatic moderation: text, every photo, frames from every video, PDF names.
    const images = [];
    for (const m of media) if (m.kind === 'image' && m.type !== 'image/gif') images.push(await blobToDataUrl(m.pathname, m.type));
    const frames = (Array.isArray(req.body.frames) ? req.body.frames : []).filter(f => /^data:image\/jpeg;base64,/.test(f) && f.length < 400000).slice(0, 8);
    if (media.some(m => m.kind === 'video') && !frames.length) return res.status(400).json({ error: 'Could not read that video. Try a different file.' });
    images.push(...frames);
    const names = media.map(m => m.name).join(' ');

    let verdict;
    try { verdict = await check({ text: [text, names].filter(Boolean).join('\n'), images }); }
    catch (err) { return res.status(503).json({ error: 'The safety check is unavailable right now. Try again in a minute.' }); }

    if (!verdict.ok) {
      for (const m of media) await import('@vercel/blob').then(b => b.del(m.pathname)).catch(() => {});
      const result = admin ? { banned: false, strikes: 0 } : await punish(me, verdict.categories, { text: text.slice(0, 200), media: media.length });
      if (admin) await log({ action: 'blocked', username: me.username, email: me.email, reason: label(verdict.categories), text: text.slice(0, 200) });
      return res.status(422).json({
        error: result.banned
          ? 'This post broke the rules and your account has been banned automatically.'
          : `This post was blocked for ${label(verdict.categories)}. That's strike ${result.strikes} of 3 — at 3 your account is banned automatically.`,
        banned: result.banned
      });
    }

    const post = await createPost(me, text, media);
    me.lastPostAt = post.createdAt;
    await saveAccount(me);
    return res.status(200).json({ post: shape(post, me.username, admin), author: mini(me) });
  }

  if (action === 'react' || action === 'delete' || action === 'report' || action === 'restore') {
    const post = await getPost(String(req.body.id || ''));
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (action === 'react') {
      const emoji = String(req.body.emoji || '');
      if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: 'Unknown reaction' });
      post.reactions = post.reactions || {};
      const who = new Set(post.reactions[emoji] || []);
      if (who.has(me.username)) who.delete(me.username); else who.add(me.username);
      post.reactions[emoji] = [...who];
      await savePost(post);
      return res.status(200).json({ post: shape(post, me.username, admin) });
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
      return res.status(200).json({ deleted: true });
    }

    // Report: an admin report removes it right away; otherwise 3 different
    // members reporting a post removes it and gives the author a strike.
    if (post.author === me.username) return res.status(400).json({ error: "You can't report your own post" });
    post.reports = [...new Set([...(post.reports || []), me.username])];
    // Reports don't punish anyone automatically; they hide the post until the
    // owner looks (Admin > Reported posts) and decides to restore or remove it.
    if (post.reports.length >= REPORTS_TO_HIDE && !post.hidden) {
      post.hidden = true;
      await log({ action: 'hidden', username: post.author, email: post.email, reason: `reported by ${post.reports.length} members`, text: String(post.text || '').slice(0, 200), postId: post.id });
    }
    await savePost(post);
    return res.status(200).json({ reported: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
