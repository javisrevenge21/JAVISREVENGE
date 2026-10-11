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

test('discovery pages, legal pages, crawler files and public APIs are open', () => {
  for (const path of ['/', '/index.html', '/socials', '/socials/', '/archives', '/archives/',
    '/privacy', '/terms', '/cookies', '/signin', '/unsubscribe', '/robots.txt', '/sitemap.xml',
    '/assets/og-image.jpg', '/api/waitlist', '/api/latest-post', '/api/auth/login', '/api/unsubscribe']) {
    assert.equal(middleware(request(path)), undefined, path);
  }
});

test('member pages still redirect signed-out visitors to sign in', () => {
  for (const path of ['/account', '/admin', '/contact', '/shop', '/socials-extra', '/archives/secret']) {
    const response = middleware(request(path + '?x=1'));
    assert.equal(response.status, 307, path);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.pathname, '/signin');
    assert.equal(location.searchParams.get('returnTo'), path + '?x=1');
  }
});

test('member APIs still return 401 when signed out', async () => {
  for (const path of ['/api/account', '/api/account/preferences', '/api/admin/users', '/api/admin/send', '/api/tip-upload']) {
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
