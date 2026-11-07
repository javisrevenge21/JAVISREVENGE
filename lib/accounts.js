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
  banners: ['none', 'stars', 'stripes', 'waves', 'grid', 'dots', 'flames', 'palms'],
  fonts: ['bold', 'serif', 'mono', 'wide', 'script'],
  effects: ['none', 'glow', 'gradient', 'shadow', 'outline'],
  finishes: ['glossy', 'matte', 'neon', 'glass'],
  moods: ['', '🔥 Locked in', '😴 Off duty', '🎧 Vibing', '📰 Reading the news', '🇺🇸 Patriotic', '🧠 Thinking', '🍿 Just watching']
};

function pick(value, list, fallback) { return list.includes(value) ? value : fallback; }
function handle(value) { const h = String(value || '').trim().replace(/^@/, ''); return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : ''; }
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
    banner: 'banner' in input ? pick(input.banner, o.banners, 'none') : (p.banner || 'none'),
    font: 'font' in input ? pick(input.font, o.fonts, 'bold') : (p.font || 'bold'),
    effect: 'effect' in input ? pick(input.effect, o.effects, 'none') : (p.effect || 'none'),
    finish: 'finish' in input ? pick(input.finish, o.finishes, 'glossy') : (p.finish || 'glossy'),
    quote: 'quote' in input ? clean(input.quote, 120) : (p.quote || ''),
    pronouns: 'pronouns' in input ? clean(input.pronouns, 20) : (p.pronouns || ''),
    birthday: 'birthday' in input ? (/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(input.birthday)) ? input.birthday : '') : (p.birthday || ''),
    instagram: 'instagram' in input ? handle(input.instagram) : (p.instagram || ''),
    x: 'x' in input ? handle(input.x) : (p.x || ''),
    tiktok: 'tiktok' in input ? handle(input.tiktok) : (p.tiktok || ''),
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
  const account = await getAccount(email).catch(() => null);
  if (account?.username) await del(`usernames/${account.username}.json`).catch(() => {});
  await del(pathnameFor(email));
}

// ---- Usernames ----
// Each username is reserved by its own blob (usernames/<name>.json). Writing it
// with allowOverwrite:false makes the claim atomic: if two people race for the
// same name, only one write succeeds.
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'javisrevenge', 'javi', 'ryanjavi', 'ryan', 'support', 'contact',
  'help', 'root', 'system', 'mod', 'moderator', 'staff', 'official', 'owner', 'null', 'undefined', 'account', 'signin',
  'api', 'www', 'politics', 'archives', 'shop', 'socials', 'about', 'wall', 'caliconservative', 'officialcaliconservative', 'everyone']);

export function normalizeUsername(value) { return String(value || '').trim().replace(/^@/, '').toLowerCase(); }

export function usernameProblem(name) {
  if (!USERNAME_RE.test(name)) return 'Use 3 to 20 characters: lowercase letters, numbers, or underscores.';
  if (RESERVED.has(name) || /^_|_$|__/.test(name)) return 'That username is not available.';
  return null;
}

export async function usernameTaken(name) {
  try { return !!(await readJson(`usernames/${name}.json`)); }
  catch (error) { if (error && (error.status === 404 || error.name === 'BlobNotFoundError')) return false; throw error; }
}

export const TERMS_VERSION = '2026-11-07';

export async function claimUsername(email, rawName, agreed = false) {
  const name = normalizeUsername(rawName);
  const problem = usernameProblem(name);
  if (problem) return { error: problem };
  const account = await getAccount(email);
  if (!account) return { error: 'Account not found' };
  if (account.username) return { error: 'You already have a username.' };
  if (agreed !== true) return { error: 'Please confirm you are at least 13 and agree to the Terms and Privacy Notice.' };
  try {
    await put(`usernames/${name}.json`, JSON.stringify({ email: account.email, claimedAt: new Date().toISOString() }), {
      access: 'private', allowOverwrite: false, contentType: 'application/json'
    });
  } catch (error) {
    return { error: 'That username is taken. Try another one.' };
  }
  account.username = name;
  account.termsAcceptedAt = new Date().toISOString();
  account.termsVersion = TERMS_VERSION;
  account.ageConfirmed = '13+';
  account.updatedAt = new Date().toISOString();
  return { account: await saveAccount(account) };
}

// ---- Lookups and moderation ----
export async function accountByUsername(rawName) {
  const name = normalizeUsername(rawName);
  if (!USERNAME_RE.test(name)) return null;
  try {
    const claim = await readJson(`usernames/${name}.json`);
    return claim ? await getAccount(claim.email) : null;
  } catch (error) {
    if (error && (error.status === 404 || error.name === 'BlobNotFoundError')) return null;
    throw error;
  }
}

function banPath(email) {
  const id = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(String(email).trim().toLowerCase()).digest('hex');
  return `bans/${id}.json`;
}

export async function isBanned(email) {
  try { return !!(await readJson(banPath(email))); }
  catch (error) { if (error && (error.status === 404 || error.name === 'BlobNotFoundError')) return false; throw error; }
}

export async function banEmail(email, info = {}) {
  await put(banPath(email), JSON.stringify({ email: String(email).trim().toLowerCase(), ...info, bannedAt: new Date().toISOString() }), {
    access: 'private', allowOverwrite: true, contentType: 'application/json'
  });
}

export async function unbanEmail(email) { await del(banPath(email)); }

export async function listBans() {
  const out = [];
  let cursor;
  do {
    const result = await list({ prefix: 'bans/', limit: 1000, cursor });
    for (const blob of result.blobs) { const b = await readJson(blob.pathname).catch(() => null); if (b) out.push(b); }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => String(b.bannedAt).localeCompare(String(a.bannedAt)));
}

// Public-facing profile: never includes the email address.
export function publicProfile(account) {
  const p = account.profile || {};
  return {
    username: account.username, name: account.name, picture: account.picture || '',
    avatar: p.avatar || '', theme: p.theme || 'silver', title: p.title || 'Member', mood: p.mood || '',
    bio: p.bio || '', quote: p.quote || '', location: p.location || '', pronouns: p.pronouns || '',
    interests: p.interests || [], banner: p.banner || 'none', font: p.font || 'bold', effect: p.effect || 'none',
    finish: p.finish || 'glossy', instagram: p.instagram || '', x: p.x || '', tiktok: p.tiktok || '',
    createdAt: account.createdAt
  };
}

export { readJson as readBlobJson };

// Remove a username from everyone's follow/block/mute lists (used when an
// account is deleted, removed or banned, so a reused username starts clean).
export async function scrubUsername(username) {
  if (!username) return;
  for (const a of await listAccounts()) {
    let changed = false;
    for (const k of ['following', 'followers', 'blocked', 'muted']) {
      if ((a[k] || []).includes(username)) { a[k] = a[k].filter(u => u !== username); changed = true; }
    }
    if (changed) await saveAccount(a);
  }
}
