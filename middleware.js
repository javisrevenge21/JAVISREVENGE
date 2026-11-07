import { verifySession, parseCookies, SESSION_COOKIE } from './lib/session.js';

// The whole site requires a valid Google sign-in session. Only these stay open:
// the sign-in page, the legal pages (Terms, Privacy, Cookies), the Google OAuth flow, static assets the sign-in page needs
// (CSS, banner, images), email unsubscribe (page + API), and crawler files.
// '/' (Home) is members-only: signed-out visitors are redirected to /signin.
const PUBLIC_EXACT = new Set([
  '/signin', '/signin/', '/unsubscribe', '/unsubscribe/',
  '/terms', '/terms/', '/privacy', '/privacy/', '/cookies', '/cookies/',
  '/robots.txt', '/sitemap.xml', '/favicon.ico'
]);
const PUBLIC_PREFIXES = ['/assets/', '/api/auth/', '/api/unsubscribe'];

const USERNAME_SETUP = ['/username', '/api/account', '/api/auth', '/account'];

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
  if (session) {
    // Everyone needs a username. Until they pick one, only the username page,
    // the account APIs it uses, and sign-out are reachable.
    if (!session.username && !USERNAME_SETUP.some(p => path === p || path.startsWith(p + '/'))) {
      if (path.startsWith('/api/')) return Response.json({ error: 'Username required' }, { status: 403 });
      const pick = new URL('/username', request.url);
      if (path !== '/') pick.searchParams.set('returnTo', path + url.search);
      return Response.redirect(pick, 307);
    }
    return;
  }

  if (path.startsWith('/api/')) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const signin = new URL('/signin', request.url);
  signin.searchParams.set('returnTo', path + url.search);
  return Response.redirect(signin, 307);
}
