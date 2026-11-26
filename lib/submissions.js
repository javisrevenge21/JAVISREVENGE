import crypto from 'node:crypto';
import { list, put, del } from '@vercel/blob';
import { readBlobJson } from './accounts.js';

// Fan submissions from the Archives page: photos, videos and files members
// send in so the owner can repost them on Instagram. Unlike anonymous tips,
// a submission is credited: it keeps the sender's username (and email, for
// the owner only) plus the Instagram handle they want credited.
//
// Records:  fan-submissions/<id>.json        (private)
// Files:    fan-submissions-media/<random>   (private, uploaded straight from
//           the browser to Blob, so big videos never pass through a function)

export const MEDIA_PREFIX = 'fan-submissions-media/';
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per file
export const MAX_CAPTION = 500;
export const GAP_MS = 60 * 1000; // one submission a minute per member

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const OTHER_TYPES = ['application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'];
export const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...OTHER_TYPES];

const KEY = id => `fan-submissions/${id}.json`;
const ID_RE = /^\d{13}-[a-f0-9]{10}$/;
const MEDIA_RE = /^fan-submissions-media\/[\w.\-]+$/;

export function isSubmissionMedia(pathname) {
  return MEDIA_RE.test(String(pathname || ''));
}

export function kindOf(type) {
  if (IMAGE_TYPES.includes(type)) return 'image';
  if (VIDEO_TYPES.includes(type)) return 'video';
  if (String(type).startsWith('audio/')) return 'audio';
  return 'file';
}

// "@Some.Handle", "instagram.com/some.handle/" -> "some.handle". Empty if not
// a valid Instagram username.
export function cleanHandle(value) {
  const h = String(value || '').trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h.toLowerCase() : '';
}

export function cleanCaption(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CAPTION);
}

// Checks a submission before it's saved. `heads` maps pathname -> Blob head()
// result (or null if the upload is missing). Returns { error } or { files }.
export function validateSubmission({ files, consent }, heads) {
  if (consent !== true) return { error: 'Please confirm you own this content and allow it to be reposted.' };
  const wanted = Array.isArray(files) ? files : [];
  if (!wanted.length) return { error: 'Add at least one photo, video or file.' };
  if (wanted.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files per submission.` };
  const out = [];
  for (const w of wanted) {
    const pathname = String(w?.pathname || '');
    if (!isSubmissionMedia(pathname)) return { error: 'Invalid upload.' };
    const info = heads[pathname];
    if (!info) return { error: 'A file didn’t finish uploading. Try again.' };
    if (!ALLOWED_TYPES.includes(info.contentType)) return { error: 'That file type isn’t allowed.' };
    if (info.size > MAX_FILE_BYTES) return { error: 'Each file must be 100 MB or less.' };
    out.push({ pathname, name: String(w.name || 'file').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80), type: info.contentType, kind: kindOf(info.contentType), size: info.size });
  }
  return { files: out };
}

export function newId(now = Date.now()) {
  // Newest first when Blob lists by name.
  return String(9999999999999 - now).padStart(13, '0') + '-' + crypto.randomBytes(5).toString('hex');
}

async function save(sub) {
  await put(KEY(sub.id), JSON.stringify(sub), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
  return sub;
}

export async function createSubmission(account, { handle, caption, files }) {
  const now = Date.now();
  return save({
    id: newId(now),
    createdAt: new Date(now).toISOString(),
    username: account.username || '',
    email: account.email || '',
    handle: cleanHandle(handle),
    caption: cleanCaption(caption),
    files,
    consent: { owns: true, allowsRepost: true, at: new Date(now).toISOString() },
    status: 'new'
  });
}

export async function listSubmissions(limit = 200) {
  const r = await list({ prefix: 'fan-submissions/', limit });
  const all = await Promise.all(r.blobs.map(b => readBlobJson(b.pathname).catch(() => null)));
  return all.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}

export async function getSubmission(id) {
  if (!ID_RE.test(String(id))) return null;
  return readBlobJson(KEY(id)).catch(() => null);
}

export async function markSubmission(id, status) {
  const sub = await getSubmission(id);
  if (!sub || !['new', 'seen', 'posted'].includes(status)) return null;
  sub.status = status;
  return save(sub);
}

export async function deleteSubmission(id) {
  const sub = await getSubmission(id);
  if (!sub) return false;
  for (const f of sub.files || []) await del(f.pathname).catch(() => {});
  await del(KEY(id));
  return true;
}
