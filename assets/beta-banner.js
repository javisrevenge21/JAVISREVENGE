// Beta notice shown at the top of every page. No cookies, no tracking.
// To remove: delete this file and the <script src="/assets/beta-banner.js"> tag from each page
// (or set ENABLED to false below to hide it everywhere with one edit).
//
// While maintenance mode is on, the only pages visitors can reach are the
// legal pages (Terms, Privacy, Cookies) and the maintenance page, which says
// the site is closed. So on the legal pages the banner first asks whether
// maintenance mode is on and stays hidden if it is: /maintenance answers
// normally while it's on, and redirects to / once MAINTENANCE_MODE is "off".
(function () {
  var ENABLED = true;
  if (!ENABLED || document.getElementById('jr-beta')) return;
  var LEGAL = /^\/(terms|privacy|cookies)\/?$/;
  if (!LEGAL.test(location.pathname)) return show();
  if (!window.fetch) return;
  fetch('/maintenance', { method: 'HEAD', redirect: 'manual', cache: 'no-store', credentials: 'same-origin' })
    .then(function (r) { if (r.type === 'opaqueredirect') show(); })
    .catch(function () {});

  function show() {
    if (document.getElementById('jr-beta')) return;
    var style = document.createElement('style');
    style.textContent = [
      '#jr-beta{position:relative;z-index:70;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:8px 14px;text-align:center;background:rgba(10,10,12,.92);border-bottom:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.78);font:500 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:.04em}',
      '#jr-beta b{padding:2px 8px;border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;font-size:10px;letter-spacing:.2em}',
      '.jr-account{top:56px!important}',
      '@media(max-width:600px){#jr-beta{font-size:11px;padding:7px 10px;gap:6px}.jr-account{top:72px!important}}'
    ].join('');
    document.head.appendChild(style);
    var bar = document.createElement('div');
    bar.id = 'jr-beta';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<b>BETA</b><span>We\u2019re in beta mode right now. The full site is coming very soon.</span>';
    document.body.insertBefore(bar, document.body.firstChild);
  }
})();
