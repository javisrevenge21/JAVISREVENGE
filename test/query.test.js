import test from 'node:test';
import assert from 'node:assert/strict';
import { queryOf } from '../lib/query.js';

test('queryOf reads the query string without url.parse', () => {
  assert.deepEqual(queryOf({ url: '/api/auth/login?provider=github&returnTo=%2Fwall%3Fx%3D1' }), { provider: 'github', returnTo: '/wall?x=1' });
  assert.deepEqual(queryOf({ url: '/api/auth/session?logout=1' }), { logout: '1' });
  assert.deepEqual(queryOf({ url: '/api/community' }), {});
  assert.deepEqual(queryOf({}), {});
  assert.equal(queryOf({ url: '/api/community?tag=a&tag=b' }).tag, 'b');
});

test('no API route reads req.query (it triggers the url.parse deprecation warning)', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const files = (await readdir(new URL('../api/', import.meta.url), { recursive: true })).filter(f => f.endsWith('.js'));
  for (const f of files) {
    const src = await readFile(new URL('../api/' + f, import.meta.url), 'utf8');
    assert.ok(!/req\.query/.test(src), f);
  }
});
