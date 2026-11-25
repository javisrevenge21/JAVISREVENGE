import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import middleware from '../middleware.js';
import { createSession, SESSION_COOKIE } from '../lib/session.js';
import { wallOn, isWallUrl, flagsScript, MANIFEST_WITHOUT_WALL, NON_WALL_ACTIONS } from '../lib/features.js';

const secret = 'test-secret-that-is-long-enough-for-tests';
process.env.SESSION_SECRET = secret;
process.env.MAINTENANCE_MODE = 'off';
process.env.ADMIN_EMAILS = 'owner@example.com';
const user = { sub: 'google-123', email: 'person@example.com', name: 'Person', username: 'person' };
const member = `${SESSION_COOKIE}=${encodeURIComponent(createSession(user, secret))}`;
const owner = `${SESSION_COOKIE}=${encodeURIComponent(createSession({ ...user, email: 'owner@example.com' }, secret))}`;
const req = (path, cookie) => new Request('https://www.javisrevenge.com' + path, { headers: cookie ? { cookie } : {} });

test('the Wall is off unless WALL_MODE=on', () => {
  delete process.env.WALL_MODE;
  assert.equal(wallOn(), false);
  process.env.WALL_MODE = 'ON';
  assert.equal(wallOn(), true);
  process.env.WALL_MODE = 'off';
  assert.equal(wallOn(), false);
  delete process.env.WALL_MODE;
});

test('Wall URLs are the feed, posts, profiles and notifications, not REVENGE+ or tips', () => {
  const u = p => new URL('https://x' + p);
  for (const p of ['/wall', '/wall/', '/wall/index.html', '/wall?tab=saved', '/wall?post=abc', '/wall?view=notifications', '/wall?view=network', '/u/person']) assert.equal(isWallUrl(u(p)), true, p);
  for (const p of ['/wall?view=plus', '/wall?view=plus&session_id=1', '/wall?view=tip', '/wall?view=tips', '/wall?view=ads', '/', '/account', '/wallpaper']) assert.equal(isWallUrl(u(p)), false, p);
});

test('while hidden, members are sent home from Wall pages; the owner still gets in', () => {
  delete process.env.WALL_MODE;
  for (const p of ['/wall', '/wall?tab=media', '/wall?view=notifications', '/u/someone', '/wall/index.html']) {
    const r = middleware(req(p, member));
    assert.equal(r.status, 307, p);
    assert.equal(new URL(r.headers.get('location')).pathname, '/', p);
    assert.equal(middleware(req(p, owner)), undefined, p);
  }
  assert.equal(middleware(req('/wall?view=plus', member)), undefined);
  assert.equal(middleware(req('/wall?view=tip', member)), undefined);
  assert.equal(middleware(req('/', member)), undefined);
});

test('with WALL_MODE=on, members can use the Wall again', () => {
  process.env.WALL_MODE = 'on';
  assert.equal(middleware(req('/wall', member)), undefined);
  assert.equal(middleware(req('/u/someone', member)), undefined);
  delete process.env.WALL_MODE;
});

test('flags.js tells pages whether to show the Wall', async () => {
  delete process.env.WALL_MODE;
  let r = middleware(req('/assets/flags.js', member));
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.match(await r.text(), /"on":false,"owner":false/);
  assert.match(await middleware(req('/assets/flags.js', owner)).text(), /"on":false,"owner":true/);
  process.env.WALL_MODE = 'on';
  assert.match(await middleware(req('/assets/flags.js')).text(), /"on":true/);
  delete process.env.WALL_MODE;
  // Works during maintenance too, and the script is valid JavaScript.
  delete process.env.MAINTENANCE_MODE;
  assert.equal(middleware(req('/assets/flags.js')).status, 200);
  process.env.MAINTENANCE_MODE = 'off';
  new Function(flagsScript({ on: true, owner: false }));
  new Function(fs.readFileSync(new URL('../assets/flags.js', import.meta.url), 'utf8'));
});

test('the app manifest opens on Home while the Wall is hidden', async () => {
  delete process.env.WALL_MODE;
  const r = middleware(req('/assets/app.webmanifest'));
  const m = await r.json();
  assert.equal(m.start_url, '/?source=app');
  assert.equal(m.shortcuts, undefined);
  assert.doesNotMatch(JSON.stringify(m), /Revenge Wall/);
  const original = JSON.parse(fs.readFileSync(new URL('../assets/app.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.id, original.id, 'same app id so installed apps keep working');
  process.env.WALL_MODE = 'on';
  assert.equal(middleware(req('/assets/app.webmanifest')), undefined);
  delete process.env.WALL_MODE;
  assert.deepEqual(MANIFEST_WITHOUT_WALL.icons, original.icons);
});

test('REVENGE+ and tips stay usable while the Wall is hidden', () => {
  for (const a of ['tip', 'checkout', 'confirmPlus', 'portal']) assert.ok(NON_WALL_ACTIONS.has(a), a);
  for (const a of ['post', 'reply', 'react', 'follow', 'requestMedia', 'readNotifications']) assert.ok(!NON_WALL_ACTIONS.has(a), a);
});

test('every Wall link on the shared pages is marked so it hides with the Wall', () => {
  const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  for (const p of ['index.html', 'about/index.html', 'account/index.html', 'wall/index.html']) {
    assert.match(read(p), /<script src="\/assets\/flags\.js"><\/script>/, p + ' loads flags.js');
  }
  assert.match(read('index.html'), /class="tile tile-wall[^"]*" href="\/wall" data-wall/);
  for (const p of ['index.html', 'about/index.html', 'contact/index.html']) {
    // Any element mentioning the Wall by name must carry data-wall.
    for (const line of read(p).split('\n').filter(l => /Revenge Wall|THE REVENGE WALL/.test(l) && !/^\s*[.@{]/.test(l))) {
      assert.match(line, /data-wall/, p + ': ' + line.slice(0, 80));
    }
  }
});
