import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanHandle, cleanCaption, kindOf, validateSubmission, isSubmissionMedia, newId, MAX_FILES, MAX_FILE_BYTES } from '../lib/submissions.js';
import { NON_WALL_ACTIONS } from '../lib/features.js';

const ok = (type = 'image/jpeg', size = 1000) => ({ contentType: type, size });

test('Instagram handles are cleaned or dropped', () => {
  assert.equal(cleanHandle('@Some.Handle_1'), 'some.handle_1');
  assert.equal(cleanHandle('https://www.instagram.com/javiarchives.jp/'), 'javiarchives.jp');
  assert.equal(cleanHandle('instagram.com/x'), 'x');
  assert.equal(cleanHandle('not a handle!'), '');
  assert.equal(cleanHandle('<script>'), '');
  assert.equal(cleanHandle(''), '');
});

test('captions are trimmed, capped and stripped of control characters', () => {
  assert.equal(cleanCaption('  hi\u0000 there\n\n\n\nok '), 'hi there\n\nok');
  assert.equal(cleanCaption('x'.repeat(900)).length, 500);
});

test('file kinds', () => {
  assert.equal(kindOf('image/heic'), 'image');
  assert.equal(kindOf('video/quicktime'), 'video');
  assert.equal(kindOf('audio/mpeg'), 'audio');
  assert.equal(kindOf('application/pdf'), 'file');
});

test('a submission needs consent, at least one file, and real uploads in the right folder', () => {
  const p = 'fan-submissions-media/abc123.jpg';
  assert.match(validateSubmission({ files: [{ pathname: p }], consent: false }, { [p]: ok() }).error, /confirm/);
  assert.match(validateSubmission({ files: [{ pathname: p }], consent: 'yes' }, { [p]: ok() }).error, /confirm/);
  assert.match(validateSubmission({ files: [], consent: true }, {}).error, /at least one/);
  assert.match(validateSubmission({ files: [{ pathname: 'anon-tips-media/a.jpg' }], consent: true }, { 'anon-tips-media/a.jpg': ok() }).error, /Invalid/);
  assert.match(validateSubmission({ files: [{ pathname: 'fan-submissions-media/../accounts/x.json' }], consent: true }, {}).error, /Invalid/);
  assert.match(validateSubmission({ files: [{ pathname: p }], consent: true }, { [p]: null }).error, /finish uploading/);
  assert.match(validateSubmission({ files: [{ pathname: p }], consent: true }, { [p]: ok('text/html') }).error, /type/);
  assert.match(validateSubmission({ files: [{ pathname: p }], consent: true }, { [p]: ok('image/jpeg', MAX_FILE_BYTES + 1) }).error, /100 MB/);
  const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ pathname: `fan-submissions-media/f${i}.jpg` }));
  assert.match(validateSubmission({ files: many, consent: true }, Object.fromEntries(many.map(f => [f.pathname, ok()]))).error, /Up to 5/);
});

test('a good submission keeps type, kind, size and a safe name', () => {
  const p = 'fan-submissions-media/clip.mov';
  const r = validateSubmission({ files: [{ pathname: p, name: 'My\u0007 clip.mov' }], consent: true }, { [p]: ok('video/quicktime', 5e7) });
  assert.deepEqual(r.files, [{ pathname: p, name: 'My clip.mov', type: 'video/quicktime', kind: 'video', size: 5e7 }]);
});

test('only fan upload paths count as submission media', () => {
  assert.equal(isSubmissionMedia('fan-submissions-media/a-1_b.png'), true);
  assert.equal(isSubmissionMedia('fan-submissions-media/sub/a.png'), false);
  assert.equal(isSubmissionMedia('wall-media/x/a.png'), false);
});

test('ids sort newest first', () => {
  assert.ok(newId(2000) < newId(1000));
  assert.match(newId(), /^\d{13}-[a-f0-9]{10}$/);
});

test('sending uploads works while the Wall is hidden', () => {
  assert.ok(NON_WALL_ACTIONS.has('submit'));
  assert.ok(!NON_WALL_ACTIONS.has('submissionDelete'));
});

test('the Archives page has the upload form at the bottom and the owner inbox hidden by default', () => {
  const html = fs.readFileSync(new URL('../archives/index.html', import.meta.url), 'utf8');
  const form = html.indexOf('id="fan-submit"');
  assert.ok(form > html.indexOf('REQUEST ACCESS'), 'form comes after the archive card');
  assert.ok(form < html.indexOf('class="back"'), 'form comes before the Back button');
  assert.match(html, /<section class="card" id="fan-inbox" hidden>/);
  assert.match(html, /id="fanConsent"/);
  assert.match(html, /src="\/assets\/fan-submit\.js"/);
});
