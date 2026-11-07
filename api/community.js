import { getAccount, saveAccount, listAccounts, accountByUsername, publicProfile, isBanned } from '../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../lib/session.js';
import { listPosts, getPost, savePost, createPost, deletePost, REACTIONS } from '../lib/wall.js';

// One function for the members community (the Hobby plan caps the site at 12):
//   GET  ?view=wall                 newest Wall posts
//   GET  ?view=profile&u=<username> a member's public profile + their posts
//   GET  ?view=members              member directory (newest first)
//   POST { action: 'post', text }   write on the Wall
//   POST { action: 'react', id, emoji }
//   POST { action: 'delete', id }   your own post, or any post if admin

const POST_GAP_MS = 20 * 1000;

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 280);
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
  const reactions = {};
  for (const e of REACTIONS) {
    const who = (post.reactions && post.reactions[e]) || [];
    reactions[e] = { count: who.length, mine: !!me && who.includes(me) };
  }
  return { id: post.id, author: post.author, text: post.text, createdAt: post.createdAt, reactions, canDelete: admin || post.author === me };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  const me = await getAccount(session.email);
  if (!me || !me.username || await isBanned(me.email)) return res.status(403).json({ error: 'Not allowed' });
  const admin = isAdmin(session);

  if (req.method === 'GET') {
    const view = String(req.query.view || 'wall');
    if (view === 'wall') {
      const posts = await listPosts(40);
      return res.status(200).json({ me: me.username, admin, reactions: REACTIONS, authors: await authorsFor(posts), posts: posts.map(p => shape(p, me.username, admin)) });
    }
    if (view === 'profile') {
      const account = await accountByUsername(req.query.u);
      if (!account || !account.username) return res.status(404).json({ error: 'No member with that username' });
      const posts = (await listPosts(200)).filter(p => p.author === account.username).slice(0, 20);
      const out = { me: me.username, admin, reactions: REACTIONS, profile: publicProfile(account), posts: posts.map(p => shape(p, me.username, admin)) };
      if (admin) out.email = account.email; // only the site owner sees who is behind a username
      return res.status(200).json(out);
    }
    if (view === 'members') {
      const members = (await listAccounts()).filter(a => a.username)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 200).map(a => ({ ...mini(a), createdAt: a.createdAt }));
      return res.status(200).json({ members, total: members.length });
    }
    return res.status(400).json({ error: 'Unknown view' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const action = req.body?.action;

  if (action === 'post') {
    const text = cleanText(req.body.text);
    if (!text) return res.status(400).json({ error: 'Write something first.' });
    if (!admin && me.lastPostAt && Date.now() - Date.parse(me.lastPostAt) < POST_GAP_MS) {
      return res.status(429).json({ error: 'Slow down — wait a few seconds between posts.' });
    }
    const post = await createPost(me, text);
    me.lastPostAt = post.createdAt;
    await saveAccount(me);
    return res.status(200).json({ post: shape(post, me.username, admin), author: mini(me) });
  }

  if (action === 'react') {
    const post = await getPost(String(req.body.id || ''));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const emoji = String(req.body.emoji || '');
    if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: 'Unknown reaction' });
    post.reactions = post.reactions || {};
    const who = new Set(post.reactions[emoji] || []);
    if (who.has(me.username)) who.delete(me.username); else who.add(me.username);
    post.reactions[emoji] = [...who];
    await savePost(post);
    return res.status(200).json({ post: shape(post, me.username, admin) });
  }

  if (action === 'delete') {
    const post = await getPost(String(req.body.id || ''));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!admin && post.author !== me.username) return res.status(403).json({ error: 'Not your post' });
    await deletePost(post.id);
    return res.status(200).json({ deleted: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
