import crypto from 'node:crypto';
import { list, put, del } from '@vercel/blob';
import { readBlobJson } from './accounts.js';

// Sponsored posts the owner sells directly. Each ad is a private blob.
// Only counts are tracked (impressions, clicks) — never who saw or clicked.

const KEY = id => `ads/${id}.json`;

export async function listAds() {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix: 'ads/', limit: 1000, cursor });
    for (const b of r.blobs) { const a = await readBlobJson(b.pathname).catch(() => null); if (a) out.push(a); }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function isLive(ad, now = Date.now()) {
  return ad.active && (!ad.startsAt || Date.parse(ad.startsAt) <= now) && (!ad.endsAt || Date.parse(ad.endsAt) > now);
}

function clean(v, max) { return String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }

export async function saveAd(input, existing = null) {
  const now = new Date().toISOString();
  let link = clean(input.link, 400);
  if (link && !/^https:\/\//i.test(link)) link = 'https://' + link.replace(/^\w+:\/\//, '');
  try { if (link) new URL(link); } catch { throw new Error('That link is not a valid web address'); }
  const image = clean(input.image, 200);
  if (image && !/^ads-media\/[\w.\-]+$/.test(image)) throw new Error('Invalid image');
  const ad = {
    id: existing ? existing.id : crypto.randomBytes(6).toString('hex'),
    sponsor: clean(input.sponsor, 60),
    headline: clean(input.headline, 90),
    text: clean(input.text, 280),
    cta: clean(input.cta, 24) || 'Learn more',
    link,
    image: image || (existing && existing.image) || '',
    placement: ['feed', 'sidebar', 'both'].includes(input.placement) ? input.placement : 'both',
    active: input.active !== false,
    startsAt: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    impressions: existing ? existing.impressions || 0 : 0,
    clicks: existing ? existing.clicks || 0 : 0,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now
  };
  if (!ad.sponsor || !ad.headline || !ad.link) throw new Error('Sponsor name, headline and link are required');
  await put(KEY(ad.id), JSON.stringify(ad), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
  return ad;
}

export async function getAd(id) {
  if (!/^[a-f0-9]{12}$/.test(String(id))) return null;
  return readBlobJson(KEY(id)).catch(() => null);
}

export async function deleteAd(id) {
  const ad = await getAd(id);
  if (ad && ad.image) await del(ad.image).catch(() => {});
  await del(KEY(id));
}

export async function bump(ids, field) {
  for (const id of [...new Set(ids)].slice(0, 6)) {
    const ad = await getAd(id);
    if (!ad) continue;
    ad[field] = (ad[field] || 0) + 1;
    await put(KEY(id), JSON.stringify(ad), { access: 'private', allowOverwrite: true, contentType: 'application/json' }).catch(() => {});
  }
}

export function publicAd(ad) {
  return { id: ad.id, sponsor: ad.sponsor, headline: ad.headline, text: ad.text, cta: ad.cta, link: ad.link, placement: ad.placement,
    image: ad.image ? '/api/community?media=' + encodeURIComponent(ad.image) : '' };
}
