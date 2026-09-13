import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  parseCookies,
  safeReturnTo,
  unsubscribeToken,
  verifySession,
  verifyUnsubscribeToken
} from '../lib/session.js';

const secret = 'test-secret-that-is-long-enough-for-tests';
const user = { sub: 'google-123', email: 'person@example.com', name: 'Person' };

test('creates and verifies a session', () => {
  const token = createSession(user, secret, 1_000_000);
  const session = verifySession(token, secret, 1_000_001);
  assert.equal(session.email, user.email);
  assert.equal(session.sub, user.sub);
});

test('rejects tampered and expired sessions', () => {
  const token = createSession(user, secret, 1_000_000);
  assert.equal(verifySession(token + 'x', secret, 1_000_001), null);
  assert.equal(verifySession(token, secret, 1_000_000 + 8 * 24 * 60 * 60 * 1000), null);
});

test('accepts local return paths only', () => {
  assert.equal(safeReturnTo('/kirk?x=1'), '/kirk?x=1');
  assert.equal(safeReturnTo('https://evil.example'), '/');
  assert.equal(safeReturnTo('//evil.example'), '/');
});

test('parses cookies and verifies unsubscribe links', () => {
  assert.deepEqual(parseCookies('a=1; b=hello%20world'), { a: '1', b: 'hello world' });
  const token = unsubscribeToken('Person@Example.com', secret);
  assert.equal(verifyUnsubscribeToken(token, secret), 'person@example.com');
  assert.equal(verifyUnsubscribeToken(token + 'x', secret), null);
});
