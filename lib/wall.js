import crypto from 'node:crypto';
import { list, put, del } from '@vercel/blob';
import { readBlobJson } from './accounts.js';

// The Wall: short posts from members. Each post is one private blob whose
// name starts with an inverted timestamp, so listing returns newest first.
export const REACTIONS = ['🔥', '🇺🇸', '😂', '💯', '👏', '😤'];
const MAX = 9999999999999;

function key(id) { return `wall/${id}.json`; }

export async function listPosts(limit = 40) {
  const result = await list({ prefix: 'wall/', limit });
  const posts = await Promise.all(result.blobs.map(b => readBlobJson(b.pathname).catch(() => null)));
  return posts.filter(Boolean);
}

export async function getPost(id) {
  if (!/^\d{13}-[a-f0-9]{8}$/.test(id)) return null;
  try { return await readBlobJson(key(id)); } catch { return null; }
}

export async function savePost(post) {
  await put(key(post.id), JSON.stringify(post), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
  return post;
}

export async function createPost(author, text, media = []) {
  const now = Date.now();
  const id = String(MAX - now).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex');
  return savePost({ id, author: author.username, email: author.email, text, media, createdAt: new Date(now).toISOString(), reactions: {}, reports: [] });
}

async function delMedia(post) {
  for (const m of (post && post.media) || []) await del(m.pathname).catch(() => {});
}

export async function deletePost(id) {
  const post = await getPost(id);
  await delMedia(post);
  await del(key(id));
}

export async function deletePostsBy(email) {
  let cursor, n = 0;
  do {
    const result = await list({ prefix: 'wall/', limit: 1000, cursor });
    for (const b of result.blobs) {
      const p = await readBlobJson(b.pathname).catch(() => null);
      if (p && p.email === email) { await delMedia(p); await del(b.pathname); n++; }
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return n;
}

// Full erase of one member's activity on the Wall: their posts and uploads,
// their replies on other people's posts, their reactions, poll votes and
// reports. Used when an account is deleted, removed or banned.
export async function purgeMember(email, username) {
  let cursor, posts = 0, replies = 0;
  do {
    const result = await list({ prefix: 'wall/', limit: 1000, cursor });
    for (const b of result.blobs) {
      const p = await readBlobJson(b.pathname).catch(() => null);
      if (!p) continue;
      if (p.email === email) { await delMedia(p); await del(b.pathname); posts++; continue; }
      let changed = false;
      const before = (p.replies || []).length;
      p.replies = (p.replies || []).filter(r => r.email !== email);
      if (p.replies.length !== before) { replies += before - p.replies.length; changed = true; }
      if (username) {
        for (const e of Object.keys(p.reactions || {})) {
          const n = p.reactions[e].length; p.reactions[e] = p.reactions[e].filter(u => u !== username); if (p.reactions[e].length !== n) changed = true;
        }
        if (p.poll) for (const o of p.poll.options) { const n = o.votes.length; o.votes = o.votes.filter(u => u !== username); if (o.votes.length !== n) changed = true; }
        if ((p.reports || []).includes(username)) { p.reports = p.reports.filter(u => u !== username); changed = true; }
      }
      if (changed) await savePost(p);
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  // Any uploads that never made it into a post.
  if (username) {
    let c2;
    do {
      const r = await list({ prefix: `wall-media/${username}/`, limit: 1000, cursor: c2 });
      for (const b of r.blobs) await del(b.pathname).catch(() => {});
      c2 = r.hasMore ? r.cursor : undefined;
    } while (c2);
  }
  return { posts, replies };
}

// Everything the Wall holds about one member, for "Download my data".
export async function exportMember(email, username) {
  let cursor; const posts = [], replies = [];
  do {
    const result = await list({ prefix: 'wall/', limit: 1000, cursor });
    for (const b of result.blobs) {
      const p = await readBlobJson(b.pathname).catch(() => null);
      if (!p) continue;
      if (p.email === email) posts.push({ id: p.id, text: p.text, createdAt: p.createdAt, attachments: (p.media || []).map(m => ({ kind: m.kind, name: m.name, size: m.size })), poll: p.poll ? p.poll.options.map(o => ({ option: o.text, votes: o.votes.length })) : undefined, replyCount: (p.replies || []).length });
      for (const r of p.replies || []) if (r.email === email) replies.push({ onPost: p.id, text: r.text, createdAt: r.createdAt });
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return { posts, replies };
}
