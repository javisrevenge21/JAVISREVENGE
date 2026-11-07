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
