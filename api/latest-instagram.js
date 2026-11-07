// Returns the newest posts from @officialcaliconservative so /politics can
// embed them with Instagram's official embed script.
//
// Sources, tried in order:
//   1. Instagram Graph API, if IG_ACCESS_TOKEN is set in Vercel
//      (needs a Business/Creator account; token from a Meta developer app).
//   2. Instagram's public web profile endpoint (works without a key, but
//      Instagram sometimes blocks server requests).
//   3. The last good answer this warm function instance has seen.
//   4. A hard-coded list (the newest posts when this file was last edited).
//
// Answers are cached at Vercel's edge for 10 minutes.

const USERNAME = 'officialcaliconservative';
const FALLBACK = ['https://www.instagram.com/reel/Dfa9YhqoE2W/', 'https://www.instagram.com/reel/DfaywdMIzqz/', 'https://www.instagram.com/reel/DfaV9iMITJ1/'];
const COUNT = 3;

let lastGood = null;

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, ms);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

async function fromGraphApi() {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) { throw new Error('IG_ACCESS_TOKEN not set'); }
  const r = await fetchWithTimeout(
    'https://graph.instagram.com/me/media?fields=permalink,timestamp&limit=' + COUNT + '&access_token=' + encodeURIComponent(token),
    {}, 6000
  );
  if (!r.ok) { throw new Error('graph status ' + r.status); }
  const d = await r.json();
  const links = (d.data || []).map(function (p) { return p.permalink; }).filter(Boolean);
  if (!links.length) { throw new Error('graph returned no posts'); }
  return links;
}

async function fromWebProfile() {
  const r = await fetchWithTimeout(
    'https://i.instagram.com/api/v1/users/web_profile_info/?username=' + USERNAME,
    { headers: { 'x-ig-app-id': '936619743392459', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' } },
    6000
  );
  if (!r.ok) { throw new Error('web profile status ' + r.status); }
  const d = await r.json();
  const edges = (((d.data || {}).user || {}).edge_owner_to_timeline_media || {}).edges || [];
  const links = edges.map(function (e) { return e.node; })
    .filter(function (n) { return n && /^[\w-]+$/.test(n.shortcode || ''); })
    .sort(function (a, b) { return (b.taken_at_timestamp || 0) - (a.taken_at_timestamp || 0); })
    .slice(0, COUNT)
    .map(function (n) { return 'https://www.instagram.com/' + (n.product_type === 'clips' ? 'reel' : 'p') + '/' + n.shortcode + '/'; });
  if (!links.length) { throw new Error('web profile returned no posts'); }
  return links;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const errors = [];
  for (const [source, fn] of [['graph', fromGraphApi], ['web', fromWebProfile]]) {
    try {
      const posts = await fn();
      lastGood = posts;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
      return res.status(200).end(JSON.stringify({ posts: posts, source: source }));
    } catch (err) {
      errors.push(String((err && err.message) || err));
    }
  }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  return res.status(200).end(JSON.stringify({
    posts: lastGood || FALLBACK,
    source: lastGood ? 'memory' : 'fallback',
    error: errors.join('; ')
  }));
}
