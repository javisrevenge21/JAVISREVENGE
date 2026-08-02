// Returns the newest tweet id for the profile below.
// Used by index.html so the embedded post follows the latest post
// instead of being pinned to a hard-coded id.

const SCREEN_NAME = 'javisrevenge';
const FALLBACK_ID = '2083752475958694176';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const upstream = await fetch(
      'https://syndication.twitter.com/srv/timeline-profile/screen-name/' + SCREEN_NAME,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }
    );

    if (!upstream.ok) {
      throw new Error('upstream status ' + upstream.status);
    }

    const html = await upstream.text();
    const ids = [];

    const entryRe = /tweet-(\d{15,25})/g;
    let match;
    while ((match = entryRe.exec(html)) !== null) {
      ids.push(match[1]);
    }

    if (ids.length === 0) {
      const idRe = /"id_str"\s*:\s*"(\d{15,25})"/g;
      while ((match = idRe.exec(html)) !== null) {
        ids.push(match[1]);
      }
    }

    if (ids.length === 0) {
      throw new Error('no tweet ids found');
    }

    // Tweet ids are snowflakes, so the numerically largest is the newest.
    const latest = ids.reduce(function (a, b) {
      return BigInt(b) > BigInt(a) ? b : a;
    });

    return res.status(200).end(JSON.stringify({ id: latest, source: 'syndication' }));
  } catch (err) {
    return res.status(200).end(JSON.stringify({
      id: FALLBACK_ID,
      source: 'fallback',
      error: String((err && err.message) || err)
    }));
  }
};
