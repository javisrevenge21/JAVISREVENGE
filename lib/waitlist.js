import crypto from 'node:crypto';
import { get, list, put, del } from '@vercel/blob';
import { requireSameOrigin } from './session.js';
import { buildEmail, missingEmailEnv } from './email.js';

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

const CONFIRM_SUBJECT = "You're on the JAVISREVENGE PT2 list";
const CONFIRM_MESSAGE = [
  "You're on the list.",
  '',
  "PT1 is done. PT2 is coming. We'll email you when it drops.",
  '',
  'JAVISREVENGE',
  'https://www.javisrevenge.com'
].join('\n');

// Public PT2 waitlist signup: POST /api/waitlist { email }.
// vercel.json rewrites /api/waitlist to /api/unsubscribe?action=join-waitlist,
// which calls this. It lives there instead of its own api/ file because the
// Vercel Hobby plan caps a deployment at 12 functions.
// Stores the email in private Blob storage and sends one confirmation email
// through Resend, using the same helpers as the member opt-in emails.
export async function handleWaitlistSignup(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });

  // Honeypot: real people never fill the hidden "website" field.
  if (req.body?.website) return res.status(200).json({ joined: true });

  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!process.env.SESSION_SECRET || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'The waitlist is not available right now.' });
  }

  let created;
  try {
    ({ created } = await addToWaitlist(email, 'home'));
  } catch (error) {
    console.error('Waitlist save failed:', error && error.message);
    return res.status(500).json({ error: 'Could not save your signup. Please try again.' });
  }

  // Confirmation email is best effort: the signup still counts if email
  // isn't configured or Resend is down.
  let emailed = false;
  if (created && !missingEmailEnv().length) {
    try {
      const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEmail({ to: email, subject: CONFIRM_SUBJECT, message: CONFIRM_MESSAGE, origin }))
      });
      emailed = response.ok;
      if (!response.ok) console.error('Waitlist confirmation rejected:', response.status);
    } catch (error) {
      console.error('Waitlist confirmation failed:', error && error.message);
    }
  }

  return res.status(200).json({ joined: true, alreadyJoined: !created, emailed });
}
