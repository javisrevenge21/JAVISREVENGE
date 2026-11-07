import crypto from 'node:crypto';
import { list, put, del } from '@vercel/blob';
import { readBlobJson } from './accounts.js';

// Anonymous tips for the owner. A tip record never contains who sent it:
// no username, email, IP or exact time (only the date). Files go to a
// separate private folder with random names.
const KEY = id => `anon-tips/${id}.json`;

export async function createTip(text, files) {
  const now = Date.now();
  const id = String(9999999999999 - now).padStart(13, '0') + '-' + crypto.randomBytes(5).toString('hex');
  const tip = { id, text, files, date: new Date(now).toISOString().slice(0, 10), read: false };
  await put(KEY(id), JSON.stringify(tip), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
  return tip;
}

export async function listTips(limit = 200) {
  const r = await list({ prefix: 'anon-tips/', limit });
  return (await Promise.all(r.blobs.map(b => readBlobJson(b.pathname).catch(() => null)))).filter(Boolean);
}

export async function getTip(id) {
  if (!/^\d{13}-[a-f0-9]{10}$/.test(String(id))) return null;
  return readBlobJson(KEY(id)).catch(() => null);
}

export async function saveTip(tip) {
  await put(KEY(tip.id), JSON.stringify(tip), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
}

export async function deleteTip(id) {
  const tip = await getTip(id);
  for (const f of (tip && tip.files) || []) await del(f.pathname).catch(() => {});
  await del(KEY(id));
}
