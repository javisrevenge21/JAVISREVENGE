import crypto from 'node:crypto';
import { get, list, put, del } from '@vercel/blob';

function pathnameFor(email) {
  const id = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update(email.trim().toLowerCase()).digest('hex');
  return `accounts/${id}.json`;
}

async function readJson(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export async function getAccount(email) {
  try { return await readJson(pathnameFor(email)); }
  catch (error) {
    if (error && (error.status === 404 || error.name === 'BlobNotFoundError')) return null;
    throw error;
  }
}

export async function saveAccount(account) {
  const normalized = { ...account, email: account.email.trim().toLowerCase() };
  await put(pathnameFor(normalized.email), JSON.stringify(normalized), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
  return normalized;
}

export async function upsertGoogleAccount(profile) {
  const now = new Date().toISOString();
  const previous = await getAccount(profile.email);
  return saveAccount({
    sub: profile.sub,
    email: profile.email,
    name: profile.name || previous?.name || profile.email,
    picture: profile.picture || previous?.picture || '',
    notifications: previous?.notifications === true,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    lastSignInAt: now
  });
}

export async function updateNotifications(email, enabled) {
  const account = await getAccount(email);
  if (!account) return null;
  account.notifications = enabled === true;
  account.updatedAt = new Date().toISOString();
  return saveAccount(account);
}

export async function listAccounts() {
  const accounts = [];
  let cursor;
  do {
    const result = await list({ prefix: 'accounts/', limit: 1000, cursor });
    for (const blob of result.blobs) {
      const account = await readJson(blob.pathname);
      if (account) accounts.push(account);
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return accounts.sort((a, b) => String(b.lastSignInAt).localeCompare(String(a.lastSignInAt)));
}

export async function deleteAccount(email) {
  await del(pathnameFor(email));
}
