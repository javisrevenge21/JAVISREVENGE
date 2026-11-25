// THE REVENGE WALL ON/OFF SWITCH
//
// The Wall (the members' social feed: posts, replies, profiles, follows,
// notifications) is hidden unless WALL_MODE=on is set in Vercel. Turning it
// back on is just that env var plus a redeploy; nothing else needs rewriting.
//
// While it's hidden:
//  - members can't open the feed, posts, /u/ profiles or notifications
//    (they're sent to the home page) and the Wall APIs refuse;
//  - every link and bit of copy about the Wall is hidden: pages mark those
//    elements with data-wall (shown only when the Wall is on) and the
//    replacement copy with data-nowall (shown only when it's off), driven by
//    /assets/flags.js, which the middleware answers per request;
//  - REVENGE+ and anonymous tips keep working (they share the Wall's page at
//    /wall?view=plus and /wall?view=tip);
//  - the owner (ADMIN_EMAILS) can still open the Wall directly to keep
//    working on it. Nothing is deleted: posts, replies and uploads stay put.

export function wallOn() {
  return String(process.env.WALL_MODE || 'off').toLowerCase() === 'on';
}

// Views of the Wall page that aren't part of the Wall itself.
export const NON_WALL_VIEWS = new Set(['plus', 'tip', 'tips', 'ads']);

// Is this URL part of the Wall itself (as opposed to REVENGE+ or tips)?
export function isWallUrl(url) {
  const path = url.pathname;
  if (path.startsWith('/u/')) return true;
  if (path === '/wall' || path === '/wall/' || path === '/wall/index.html') {
    return !NON_WALL_VIEWS.has(url.searchParams.get('view') || '');
  }
  return false;
}

// Community API actions that still work while the Wall is hidden.
export const NON_WALL_ACTIONS = new Set(['tip', 'checkout', 'confirmPlus', 'portal']);

// Body of /assets/flags.js. Loaded in <head> so Wall elements never flash.
// owner: the owner can still see the Wall's own page while it's hidden.
export function flagsScript({ on, owner }) {
  const state = JSON.stringify({ on: !!on, owner: !!owner });
  return `(function(){var W=window.JR_WALL=${state};` +
    `var show=W.on||(W.owner&&/^\\/(wall|u\\/)/.test(location.pathname));` +
    `var d=document.documentElement;d.classList.add(show?'wall-on':'wall-off');` +
    `var s=document.createElement('style');s.textContent='.wall-off [data-wall],.wall-on [data-nowall]{display:none!important}';` +
    `(document.head||d).appendChild(s);})();\n`;
}

// The installable app's manifest while the Wall is hidden: opens on Home,
// no Wall shortcuts. (assets/app.webmanifest is the Wall-on version.)
export const MANIFEST_WITHOUT_WALL = {
  name: 'JAVISREVENGE',
  short_name: 'REVENGE',
  description: 'JAVISREVENGE: the home of Ryan Javi.',
  id: '/wall',
  start_url: '/?source=app',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#000000',
  theme_color: '#000000',
  categories: ['news', 'entertainment'],
  icons: [
    { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};
