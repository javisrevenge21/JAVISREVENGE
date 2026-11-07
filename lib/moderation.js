import { list, put } from '@vercel/blob';
import { getAccount, saveAccount, deleteAccount, banEmail, readBlobJson } from './accounts.js';
import { deletePostsBy } from './wall.js';

// Automatic moderation for the Wall.
//
// With OPENAI_API_KEY set in Vercel, every post's text and every photo (and a
// few frames from each video) go through OpenAI's free moderation model before
// they appear. Without the key, text is checked against a built-in word list
// and photo/video uploads stay switched off, because they can't be checked.
//
// What happens when something is flagged:
//   - The post is blocked and never appears.
//   - The author gets a strike. Three strikes = automatic ban.
//   - Anything sexual involving minors = immediate ban.
//   - Every decision is written to the moderation log on the admin page.

export const STRIKES_TO_BAN = 3;
const INSTANT_BAN = new Set(['sexual/minors']);
// Only clearly serious content is blocked automatically. Everyday rudeness,
// arguments and criticism are left for the owner to judge and remove by hand.
const AUTO_BLOCK = new Set(['sexual', 'sexual/minors', 'hate/threatening', 'harassment/threatening', 'illicit/violent',
  'self-harm/instructions', 'violence/graphic', 'blocklist']);
const LABELS = {
  'sexual': 'sexual content', 'sexual/minors': 'sexual content involving minors', 'harassment': 'harassment',
  'harassment/threatening': 'threats', 'hate': 'hate speech', 'hate/threatening': 'hateful threats', 'illicit': 'illegal activity',
  'illicit/violent': 'violent illegal activity', 'self-harm': 'self-harm', 'self-harm/intent': 'self-harm', 'self-harm/instructions': 'self-harm',
  'violence': 'violence', 'violence/graphic': 'graphic violence', 'blocklist': 'banned words or links', 'reports': 'reported by members'
};

export function hasAI() { return !!process.env.OPENAI_API_KEY; }
export function label(categories) { return [...new Set(categories.map(c => LABELS[c] || c))].join(', '); }

// Fallback word list (used when no AI key is set, and always for spam links).
// Kept to slurs and explicit terms; matched on word boundaries after
// normalizing common character swaps.
const BLOCKED = [
  'nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'wetback', 'gook', 'coon',
  'porn', 'pornhub', 'onlyfans', 'xvideos', 'nudes', 'pedo', 'kys', 'kill yourself'
];
const SPAM = /(https?:\/\/)?(bit\.ly|tinyurl\.com|t\.me|discord\.gg|cash\.app|telegra\.ph)\//i;

function normalize(text) {
  return String(text).toLowerCase()
    .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't')
    .replace(/(.)\1{2,}/g, '$1$1');
}

export function blocklistHit(text) {
  const t = normalize(text);
  if (SPAM.test(text)) return true;
  return BLOCKED.some(w => new RegExp('(^|[^a-z])' + w.replace(/ /g, '\\s+') + 's?($|[^a-z])').test(t));
}

// inputs: [{ type: 'text', text }] and/or [{ type: 'image_url', image_url: { url: 'data:...' } }]
async function openaiModerate(inputs) {
  const r = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: inputs })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Moderation service error: ' + (d.error?.message || r.status));
  const flagged = [];
  for (const result of d.results || []) {
    if (!result.flagged) continue;
    for (const [cat, on] of Object.entries(result.categories || {})) if (on) flagged.push(cat);
  }
  return flagged;
}

// Returns { ok: true } or { ok: false, categories: [...] }.
// images: array of data: URLs (JPEG/PNG/WebP/GIF).
export async function check({ text = '', images = [] }) {
  const categories = [];
  if (text && blocklistHit(text)) categories.push('blocklist');
  if (hasAI()) {
    if (text) categories.push(...await openaiModerate([{ type: 'text', text }]));
    // The moderation model takes one image per request alongside text.
    for (const url of images) categories.push(...await openaiModerate([{ type: 'image_url', image_url: { url } }]));
  }
  const unique = [...new Set(categories)].filter(c => AUTO_BLOCK.has(c));
  return unique.length ? { ok: false, categories: unique } : { ok: true };
}

export async function log(entry) {
  const now = Date.now();
  const id = String(9999999999999 - now).padStart(13, '0') + '-' + Math.random().toString(16).slice(2, 10);
  await put(`modlog/${id}.json`, JSON.stringify({ ...entry, at: new Date(now).toISOString() }), {
    access: 'private', allowOverwrite: true, contentType: 'application/json'
  }).catch(() => {});
}

export async function recentLog(limit = 60) {
  const result = await list({ prefix: 'modlog/', limit });
  const items = await Promise.all(result.blobs.map(b => readBlobJson(b.pathname).catch(() => null)));
  return items.filter(Boolean);
}

// Gives the author a strike (or bans them outright for the worst categories).
// Returns { banned, strikes }.
export async function punish(account, categories, detail = {}) {
  const severe = categories.some(c => INSTANT_BAN.has(c));
  account.strikes = (account.strikes || 0) + 1;
  const banned = severe || account.strikes >= STRIKES_TO_BAN;
  const reason = label(categories);
  await log({ action: banned ? 'auto-ban' : 'blocked', username: account.username, email: account.email, strikes: account.strikes, reason, categories, ...detail });
  if (banned) {
    await banEmail(account.email, { username: account.username, name: account.name, reason: 'Automatic: ' + reason, by: 'auto-moderator' });
    await deletePostsBy(account.email).catch(() => 0);
    await deleteAccount(account.email);
    return { banned: true, strikes: account.strikes };
  }
  await saveAccount(account);
  return { banned: false, strikes: account.strikes };
}

export async function strikeByEmail(email, categories, detail) {
  const account = await getAccount(email);
  return account ? punish(account, categories, detail) : { banned: false, strikes: 0 };
}
