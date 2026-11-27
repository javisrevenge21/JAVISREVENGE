// Site languages. The first test is the one that keeps the site translated:
// it fails when any English text on the site has no Spanish, Hebrew, Farsi
// or Arabic translation in assets/i18n/<lang>.json.
// `node scripts/i18n.js` lists exactly what is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { siteKeys, loadDict, LANGS, ROOT, core, parseHtml, keysOfTree, keysOfJs, toHtml, makeText } from '../scripts/i18n.js';
import { translateTexts, isLanguage, languageCookie, LANGUAGES } from '../lib/translate.js';

const MARKER = /<\d+>|<\/\d+>|<\d+\/>|\{\d+\}/g;
const markers = s => (s.match(MARKER) || []).sort();

test('every piece of site text has a translation in every language', () => {
  const keys = siteKeys();
  assert.ok(keys.size > 500, 'the text finder should find the site text');
  const missing = [];
  for (const lang of LANGS) {
    const dict = loadDict(lang);
    for (const [key, files] of keys) if (typeof dict[key] !== 'string' || !dict[key].trim()) missing.push(`${lang}: ${[...files][0]}: ${key}`);
  }
  assert.deepEqual(missing.slice(0, 30), [], `${missing.length} missing translations. Add them to assets/i18n/<lang>.json (node scripts/i18n.js lists them).`);
});

test('translations keep the links, bold words and {0} values of the English', () => {
  const bad = [];
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(loadDict(lang))) {
      const want = markers(key), got = markers(value);
      // An English plural ending filled in by code (member{1}) may be left out.
      const optional = new Set((key.match(/[A-Za-z]\{\d+\}/g) || []).map(m => m.slice(1)));
      const extra = got.filter(m => !want.includes(m));
      const lost = want.filter(m => !got.includes(m) && !optional.has(m));
      if (extra.length || lost.length || got.length !== new Set(got).size) bad.push(`${lang}: ${key} -> ${value}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('language files are valid and Farsi uses Persian letters', () => {
  for (const lang of LANGS) assert.equal(typeof loadDict(lang), 'object');
  const fa = Object.values(loadDict('fa')).join(' ');
  assert.ok(!/[يك]/.test(fa), 'Farsi should use ی and ک, not the Arabic letters');
});

test('every page loads the language script in its head', () => {
  const pages = ['index.html', 'about', 'account', 'admin', 'archives', 'contact', 'cookies', 'maintenance', 'politics', 'privacy', 'shop', 'signin', 'terms', 'unsubscribe', 'username', 'wall'];
  for (const p of pages) {
    const file = p.endsWith('.html') ? p : `${p}/index.html`;
    const head = fs.readFileSync(path.join(ROOT, file), 'utf8').split('</head>')[0];
    assert.match(head, /<script src="\/assets\/i18n\.js"><\/script>/, file);
  }
});

test('a sentence with a link is read as one unit, with the link movable', () => {
  const tree = parseHtml('<p>I agree to the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Notice</a>.</p>');
  assert.deepEqual([...keysOfTree(tree)].map(String), ['I agree to the <0>Terms of Use</0> and <1>Privacy Notice</1>.']);
  const parts = core.parseUnit('אני מסכים ל<0>תנאי השימוש</0> ול<1>הודעת הפרטיות</1>.');
  assert.equal(JSON.stringify(parts.map(p => typeof p === 'string' ? p : p.n)), JSON.stringify(['אני מסכים ל', 0, ' ול', 1, '.']));
});

test('a translation is put back with the same links, moved where the language needs them', () => {
  const tree = parseHtml('<p>I agree to the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Notice</a>.</p>');
  const p = tree.childNodes[0];
  core.apply(p, 'Acepto la <1>Política de privacidad</1> y los <0>Términos de uso</0>.', makeText);
  assert.equal(toHtml(tree), '<p>Acepto la <a href="/privacy">Política de privacidad</a> y los <a href="/terms">Términos de uso</a>.</p>');
  const btn = parseHtml('<div>Pick one <button id="b">Go</button> now</div>').childNodes[0];
  core.apply(btn, 'Elige uno ahora', makeText);
  assert.equal(toHtml(btn), '<div>Elige uno ahora<button id="b">Go</button></div>', 'elements the translation forgot are kept');
});

test('names, handles and translate="no" stay as written', () => {
  assert.equal(core.translatable('@ryanjavi'), false);
  assert.equal(core.translatable('contact@javisrevenge.com'), false);
  assert.equal(core.translatable('{0}'), false);
  assert.deepEqual([...keysOfTree(parseHtml('<p>Hi <b translate="no">Javi</b>, welcome</p>'))], ['Hi <0/>, welcome']);
  assert.deepEqual([...keysOfTree(parseHtml('<div class="notranslate">Keep me</div>'))], []);
});

test('text built in scripts is found, with code values as {0}', () => {
  const keys = keysOfJs("el.textContent = 'You are @' + d.username + '. Welcome!'; x.innerHTML = '<button>' + label + '</button><p>Saved <b>' + n + '</b> posts</p>';");
  assert.ok(keys.has('You are @{0}. Welcome!'));
  assert.ok(keys.has('Saved <0>{1}</0> posts'));
  const code = keysOfJs("fetch('/api/account', { method: 'post', headers: { 'Content-Type': 'application/json' } }); el.className = 'jr-menu open';");
  assert.deepEqual([...code], []);
});

test('templates fill in values from the page', () => {
  const d = new core.Dict({ 'You are @{0}. Welcome!': '¡Eres @{0}. Bienvenido!', '{0} member{1} will receive it.': 'Lo recibirán {0} miembros.' });
  assert.equal(d.lookup('You are @javi. Welcome!'), '¡Eres @javi. Bienvenido!');
  assert.equal(d.lookup('3 members will receive it.'), 'Lo recibirán 3 miembros.');
  assert.equal(d.lookup('Something else'), null);
  const v = new core.Dict({ '{0} vote{1}{2}': '{0} votos{2}', '· votes are anonymous': '· los votos son anónimos' });
  assert.equal(v.lookup('3 votes · votes are anonymous'), '3 votos · los votos son anónimos');
  assert.equal(v.lookup('1 vote · votes are anonymous'), '1 votos · los votos son anónimos');
});

test('languages, cookie and on-the-fly translation', async () => {
  assert.deepEqual(LANGUAGES, ['en', 'es', 'he', 'fa', 'ar']);
  assert.ok(isLanguage('fa') && !isLanguage('de'));
  assert.match(languageCookie('he'), /^jr_lang=he; Path=\/; Secure; SameSite=Lax/);
  assert.match(languageCookie('xx'), /^jr_lang=en;/);
  assert.deepEqual(await translateTexts(['Hello there friend'], 'en'), {});
  process.env.AI_GATEWAY_API_KEY = 'test';
  let calls = 0;
  const ai = async (list, lang, texts) => { calls++; return texts.map(t => `[${lang}] ${t}`); };
  const out = await translateTexts(['Hello there friend', 'Hello there friend', 42], 'es', { ai });
  assert.deepEqual(out, { 'Hello there friend': '[es] Hello there friend' });
  await translateTexts(['Hello there friend'], 'es', { ai });
  assert.equal(calls, 1, 'the second time comes from the cache');
  delete process.env.AI_GATEWAY_API_KEY;
});
