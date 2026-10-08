import crypto from 'node:crypto';
import { get, list, put, del } from '@vercel/blob';

// PT2 waitlist entries live in private Vercel Blob storage, one JSON file per
// email, keyed by an HMAC of the address (same approach as lib/accounts.js).
export const WAITLIST_PREFIX = 'waitlist/pt2/';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[a-z]{2,}$/i.test(email);
}

function pathnameFor(email) {
  const id = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update(normalizeEmail(email)).digest('hex');
  return `${WAITLIST_PREFIX}${id}.json`;
}

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export async function getWaitlistEntry(email) {
  try { return await readJson(pathnameFor(email)); }
  catch (error) {
    if (error && (error.status === 404 || error.name === 'BlobNotFoundError')) return null;
    throw error;
  }
}

// Returns { entry, created }. Existing signups are left untouched so the same
// address can't be used to trigger repeated confirmation emails.
export async function addToWaitlist(email, source = 'home') {
  const normalized = normalizeEmail(email);
  const existing = await getWaitlistEntry(normalized);
  if (existing) return { entry: existing, created: false };
  const entry = { email: normalized, list: 'pt2', source, createdAt: new Date().toISOString() };
  await put(pathnameFor(normalized), JSON.stringify(entry), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
  return { entry, created: true };
}

export async function removeFromWaitlist(email) {
  const existing = await getWaitlistEntry(email);
  if (!existing) return false;
  await del(pathnameFor(email));
  return true;
}

export async function listWaitlist() {
  const entries = [];
  let cursor;
  do {
    const result = await list({ prefix: WAITLIST_PREFIX, limit: 1000, cursor });
    for (const blob of result.blobs) {
      const entry = await readJson(blob.pathname);
      if (entry) entries.push(entry);
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return entries;
}

export async function countWaitlist() {
  let count = 0;
  let cursor;
  do {
    const result = await list({ prefix: WAITLIST_PREFIX, limit: 1000, cursor });
    count += result.blobs.length;
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return count;
}
