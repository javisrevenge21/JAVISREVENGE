import { verifySession, parseCookies, SESSION_COOKIE } from './lib/session.js';

const PUBLIC_EXACT = new Set(['/signin', '/signin/', '/privacy', '/privacy/', '/terms', '/terms/', '/cookies', '/cookies/', '/unsubscribe', '/unsubscribe/']);
const PUBLIC_PREFIXES = ['/assets/', '/api/auth/', '/api/unsubscribe', '/kirk/'];

export const config = { runtime: 'nodejs', matcher: '/(.*)' };

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/kirk' || PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))) return;

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
