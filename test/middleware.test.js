import test from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';
import { createSession, SESSION_COOKIE } from '../lib/session.js';

const secret = 'test-secret-that-is-long-enough-for-tests';
process.env.SESSION_SECRET = secret;
const user = { sub: 'google-123', email: 'person@example.com', name: 'Person' };

function request(path, cookie) {
  const headers = cookie ? { cookie } : {};
  return new Request('https://www.javisrevenge.com' + path, { headers });
}

test('only sign-in, OAuth, assets, unsubscribe and crawler files are open', () => {
  for (const path of ['/', '/signin', '/unsubscribe', '/robots.txt', '/sitemap.xml', '/favicon.ico',
    '/assets/og-image.jpg', '/assets/beta-banner.js', '/assets/legal.css', '/api/auth/login', '/api/auth/callback', '/api/unsubscribe']) {
    assert.equal(middleware(request(path)), undefined, path);
  }
});

test('every other page redirects signed-out visitors to sign in', () => {
  for (const path of ['/index.html', '/socials', '/archives', '/privacy', '/terms', '/cookies', '/account', '/admin', '/contact', '/shop', '/archives/secret']) {
    const response = middleware(request(path + '?x=1'));
    assert.equal(response.status, 307, path);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.pathname, '/signin');
    assert.equal(location.searchParams.get('returnTo'), path + '?x=1');
  }
});

test('member APIs still return 401 when signed out', async () => {
  for (const path of ['/api/account', '/api/account/preferences', '/api/admin/users', '/api/admin/send', '/api/tip-upload', '/api/waitlist', '/api/latest-post']) {
    const response = middleware(request(path));
    assert.equal(response.status, 401, path);
    assert.deepEqual(await response.json(), { error: 'Authentication required' });
  }
});

test('kirk stays disabled for everyone', () => {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(createSession(user, secret))}`;
  assert.equal(middleware(request('/kirk')).status, 404);
  assert.equal(middleware(request('/kirk/kirk.mp4', cookie)).status, 404);
});

test('a valid session still unlocks member pages', () => {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(createSession(user, secret))}`;
  assert.equal(middleware(request('/account', cookie)), undefined);
  assert.equal(middleware(request('/api/admin/users', cookie)), undefined);
  assert.equal(middleware(request('/account', `${SESSION_COOKIE}=tampered.value`)).status, 307);
});
