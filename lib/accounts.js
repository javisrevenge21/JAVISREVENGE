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

export async function upsertAccount(profile, provider = 'google') {
  const now = new Date().toISOString();
  const previous = await getAccount(profile.email);
  const providers = [...new Set([...(previous?.providers || ['google']), provider])];
  return saveAccount({
    ...(previous || {}),
    sub: previous?.sub || profile.sub,
    email: profile.email,
    name: previous?.name || profile.name || profile.email,
    picture: previous?.picture || profile.picture || '',
    providers,
    notifications: previous?.notifications === true,
    notificationsAsked: previous?.notificationsAsked === true,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    lastSignInAt: now
  });
}

// Kept for older callers.
export const upsertGoogleAccount = profile => upsertAccount(profile, 'google');

// ---- Profile customization ----
export const PROFILE_OPTIONS = {
  themes: ['silver', 'red', 'gold', 'blue', 'purple', 'green', 'pink', 'orange'],
  avatars: ['', '🦅', '🐍', '⚔️', '🔥', '🌴', '🇺🇸', '👑', '🐺', '🦁', '🌙', '⚡', '🎯', '🏴‍☠️', '😎', '🤠'],
  titles: ['Member', 'Insider', 'Archivist', 'Patriot', 'Night Owl', 'Day One', 'Truth Seeker', 'Rally Regular', 'Clip Hunter', 'Lurker'],
  interests: ['Politics', 'Archives', 'Music', 'Fashion', 'Sports', 'Gaming', 'News', 'Memes', 'Rallies', 'World Affairs', 'Los Angeles', 'Tech'],
  moods: ['', '🔥 Locked in', '😴 Off duty', '🎧 Vibing', '📰 Reading the news', '🇺🇸 Patriotic', '🧠 Thinking', '🍿 Just watching']
};

function pick(value, list, fallback) { return list.includes(value) ? value : fallback; }
function clean(value, max) { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }

export async function updateProfile(email, input) {
  const account = await getAccount(email);
  if (!account) return null;
  const p = account.profile || {};
  const o = PROFILE_OPTIONS;
  if ('displayName' in input) { const n = clean(input.displayName, 40); if (n) account.name = n; }
  account.profile = {
    bio: 'bio' in input ? clean(input.bio, 200) : (p.bio || ''),
    location: 'location' in input ? clean(input.location, 40) : (p.location || ''),
    theme: 'theme' in input ? pick(input.theme, o.themes, 'silver') : (p.theme || 'silver'),
    avatar: 'avatar' in input ? pick(input.avatar, o.avatars, '') : (p.avatar || ''),
    title: 'title' in input ? pick(input.title, o.titles, 'Member') : (p.title || 'Member'),
    mood: 'mood' in input ? pick(input.mood, o.moods, '') : (p.mood || ''),
    interests: 'interests' in input && Array.isArray(input.interests)
      ? [...new Set(input.interests.filter(i => o.interests.includes(i)))].slice(0, 6)
      : (p.interests || [])
  };
  account.updatedAt = new Date().toISOString();
  return saveAccount(account);
}

export async function updateNotifications(email, enabled) {
  const account = await getAccount(email);
  if (!account) return null;
  account.notifications = enabled === true;
  account.notificationsAsked = true;
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
