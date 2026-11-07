// JAVISREVENGE app service worker. Pages always come from the network
// (they're members-only and change constantly); if the network is down the
// offline screen is shown. Static files are cached for speed. Nothing from
// /api/ and no media is ever cached, so private data never sits on the device.
const VERSION = 'jr-v1';
const CORE = ['/assets/offline.html', '/assets/icon-192.png', '/assets/community.css', '/assets/community.js', '/assets/site-ui.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/assets/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/assets/') && !/\.(mp3|mp4|webm|mov)$/i.test(url.pathname) && !req.headers.get('range')) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
