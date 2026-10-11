// Returns the newest post id for @javisrevenge so /socials can embed it with
// the official single-post X embed. No X API key or secret is used.
//
// Sources, tried in order:
//   1. FxTwitter's free public API (api.fxtwitter.com), retried a few times
//      because it occasionally returns an empty 404 for a moment.
//   2. X's own syndication profile timeline (usually rate-limited to logged-out
//      clients these days, kept as a second chance).
//   3. The last good id this warm function instance has seen.
//   4. A hard-coded id (the newest post when this file was last edited).
//
// Successful answers are cached at Vercel's edge for 5 minutes (and served stale
// for up to a day while refreshing), so upstream gets at most a few hits an hour.

const SCREEN_NAME = 'javisrevenge';
const FALLBACK_ID = '2107929864095621344';
const UA = 'Mozilla/5.0 (compatible; javisrevenge.com latest-post; +https://www.javisrevenge.com)';

let lastGood = null;

function newest(ids) {
  return ids.reduce(function (a, b) { return BigInt(b) > BigInt(a) ? b : a; });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, ms);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

async function fromFxTwitter() {
  let lastErr = 'no attempt';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) { await sleep(300 * attempt); }
    try {
      const r = await fetchWithTimeout(
        'https://api.fxtwitter.com/2/profile/' + SCREEN_NAME + '/statuses',
        { headers: { 'User-Agent': UA, 'Accept': 'application/json' } },
        5000
      );
      if (!r.ok) { lastErr = 'fxtwitter status ' + r.status; continue; }
      const d = await r.json();
      const all = (d && Array.isArray(d.results) ? d.results : []).filter(function (p) {
        return p && /^\d{15,25}$/.test(String(p.id || '')) &&
          p.author && String(p.author.screen_name || '').toLowerCase() === SCREEN_NAME &&
          !p.reposted_by;
      });
      if (!all.length) { lastErr = 'fxtwitter returned no posts'; continue; }
      // Prefer original posts over replies, like the "Posts" tab on X.
      const originals = all.filter(function (p) { return !p.replying_to && !p.replying_to_status; });
      const pool = originals.length ? originals : all;
      return newest(pool.map(function (p) { return String(p.id); }));
    } catch (err) {
      lastErr = 'fxtwitter ' + String((err && err.message) || err);
    }
  }
  throw new Error(lastErr);
}

async function fromSyndication() {
  const r = await fetchWithTimeout(
    'https://syndication.twitter.com/srv/timeline-profile/screen-name/' + SCREEN_NAME,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' } },
    5000
  );
  if (!r.ok) { throw new Error('syndication status ' + r.status); }
  const html = await r.text();
  const ids = [];
  const re = /"id_str"\s*:\s*"(\d{15,25})"/g;
  let m;
  while ((m = re.exec(html)) !== null) { ids.push(m[1]); }
  if (!ids.length) { throw new Error('syndication returned no ids'); }
  return newest(ids);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const errors = [];

  for (const [source, fn] of [['fxtwitter', fromFxTwitter], ['syndication', fromSyndication]]) {
    try {
      const id = await fn();
      lastGood = id;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
      return res.status(200).end(JSON.stringify({ id: id, source: source }));
    } catch (err) {
      errors.push(String((err && err.message) || err));
    }
  }

  // Everything upstream failed: answer anyway, but only cache briefly so the
  // next request tries again soon.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
  return res.status(200).end(JSON.stringify({
    id: lastGood || FALLBACK_ID,
    source: lastGood ? 'memory' : 'fallback',
    error: errors.join('; ')
  }));
}
