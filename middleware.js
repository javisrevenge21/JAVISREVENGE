import { verifySession, parseCookies, SESSION_COOKIE } from './lib/session.js';

// The whole site requires a valid Google sign-in session. Only these stay open:
// the sign-in page, the Google OAuth flow, static assets the sign-in page needs
// (CSS, banner, images), email unsubscribe (page + API), and crawler files.
// '/' serves the landing page (brand + sign-in button only) so search engines get a 200.
const PUBLIC_EXACT = new Set([
  '/', '/signin', '/signin/', '/unsubscribe', '/unsubscribe/',
  '/robots.txt', '/sitemap.xml', '/favicon.ico'
]);
const PUBLIC_PREFIXES = ['/assets/', '/api/auth/', '/api/unsubscribe'];

export const config = { runtime: 'nodejs', matcher: '/(.*)' };

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/kirk' || path.startsWith('/kirk/')) {
    return new Response('Not Found', { status: 404 });
  }
  if (PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))) return;

  const cookies = parseCookies(request.headers.get('cookie') || '');
  const session = verifySession(cookies[SESSION_COOKIE], process.env.SESSION_SECRET);
  if (session) return;

  if (path.startsWith('/api/')) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const signin = new URL('/signin', request.url);
  signin.searchParams.set('returnTo', path + url.search);
  return Response.redirect(signin, 307);
}
