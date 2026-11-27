// Finds every piece of English text on the site, the same way assets/i18n.js
// reads pages in the browser, so test/i18n.test.js can check that each one
// has a translation.
//
//   node scripts/i18n.js            list text that is missing a translation
//   node scripts/i18n.js --all      list all text keys (JSON)
//
// It reads the HTML pages and the text inside the site's scripts (strings,
// including HTML built in strings; values filled in by code become {0}, {1}).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANGS = ['es', 'he', 'fa', 'ar'];

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8'), context);
export const core = context.JRI18N.core;

// Pages that are never shown (the /kirk page always answers 404).
const SKIP_DIRS = new Set(['node_modules', '.git', 'kirk', 'test', 'scripts', 'lib', 'api', '.vercel']);
// Scripts with no member-facing text.
const SKIP_SCRIPTS = new Set(['assets/i18n.js', 'assets/sw.js', 'assets/flags.js']);

// ---------- A small HTML parser that builds DOM-like nodes ----------
const VOID = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'SOURCE', 'TRACK', 'WBR', 'PARAM']);
const RAW = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE']);
const CLOSES_P = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL', 'DETAILS']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', copy: '©', middot: '·', bull: '•', larr: '←', rarr: '→', times: '×', reg: '®', trade: '™', deg: '°', euro: '€', pound: '£', rsaquo: '›', lsaquo: '‹', raquo: '»', laquo: '«', sbquo: '‚', bdquo: '„', prime: '′', uarr: '↑', darr: '↓', harr: '↔', check: '✓', hearts: '♥', star: '★', iexcl: '¡', iquest: '¿', shy: '\u00ad', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwj: '\u200d', zwnj: '\u200c', dagger: '†', sect: '§', para: '¶', plusmn: '±', frac12: '½', cent: '¢', yen: '¥' };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENT[e.toLowerCase()] ?? all;
  });
}

class El {
  constructor(name, attrs, parent) { this.nodeType = 1; this.nodeName = name; this.attrs = attrs; this.childNodes = []; this.parentNode = parent; }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  get textContent() { return this.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); }
  set textContent(v) { this.childNodes = [new Text(String(v), this)]; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  removeChild(c) { this.childNodes = this.childNodes.filter(k => k !== c); c.parentNode = null; return c; }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
}
// Text of a node tree, as HTML (used by tests).
export function toHtml(n) {
  if (n.nodeType === 3) return n.nodeValue;
  const inner = n.childNodes.map(toHtml).join('');
  if (n.nodeName === '#ROOT') return inner;
  const tag = n.nodeName.toLowerCase(), attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
  return VOID.has(n.nodeName) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${inner}</${tag}>`;
}
export const makeText = v => new Text(v, null);
class Text {
  constructor(v, parent) { this.nodeType = 3; this.nodeValue = v; this.parentNode = parent; }
  get textContent() { return this.nodeValue; }
}

export function parseHtml(src) {
  const root = new El('#ROOT', {}, null);
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const closeTo = name => { for (let i = stack.length - 1; i > 0; i--) if (stack[i].nodeName === name) { stack.length = i; return true; } return false; };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? src.length : e + 3; continue; }
    if (src[i] === '<' && src[i + 1] === '!') { const e = src.indexOf('>', i); i = e < 0 ? src.length : e + 1; continue; }
    const m = src[i] === '<' ? /^<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)\s*(\/?)>/.exec(src.slice(i)) : null;
    if (!m) {
      const e = src.indexOf('<', i + 1);
      const text = src.slice(i, e < 0 ? src.length : e);
      top().childNodes.push(new Text(decode(text), top()));
      i = e < 0 ? src.length : e;
      continue;
    }
    i += m[0].length;
    const name = m[2].toUpperCase();
    if (m[1]) { closeTo(name); continue; }
    const attrs = {};
    m[3].replace(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g, (a, k, v1, v2, v3) => { attrs[k.toLowerCase()] = decode(v1 ?? v2 ?? v3 ?? ''); return ''; });
    if (CLOSES_P.has(name) && top().nodeName === 'P') stack.pop();
    if (name === 'LI') { for (let k = stack.length - 1; k > 0 && !['UL', 'OL'].includes(stack[k].nodeName); k--) if (stack[k].nodeName === 'LI') { stack.length = k; break; } }
    if (name === 'OPTION' && top().nodeName === 'OPTION') stack.pop();
    const el = new El(name === 'SVG' ? 'svg' : name, attrs, top());
    top().childNodes.push(el);
    if (RAW.has(name)) {
      const end = src.toLowerCase().indexOf('</' + name.toLowerCase(), i);
      const raw = src.slice(i, end < 0 ? src.length : end);
      el.childNodes.push(new Text(name === 'TITLE' || name === 'TEXTAREA' ? decode(raw) : raw, el));
      i = end < 0 ? src.length : src.indexOf('>', end) + 1;
      continue;
    }
    if (!VOID.has(name) && !m[4]) stack.push(el);
  }
  return root;
}

function allElements(node, out = []) {
  for (const c of node.childNodes) if (c.nodeType === 1) { out.push(c); allElements(c, out); }
  return out;
}

// Units and attribute text in a parsed tree.
export function keysOfTree(tree, loose = false) {
  const keys = new Set();
  core.walk(tree, (el, key) => keys.add(key));
  // Also read {0} as HTML, in case code fills it with elements.
  if (loose) core.walk(tree, (el, key) => keys.add(key), true);
  for (const el of allElements(tree)) {
    if (insideSkipped(el)) continue;
    for (const [, v] of core.attrKeys(el)) keys.add(v);
  }
  return keys;
}
function insideSkipped(el) { for (let n = el; n && n.nodeType === 1; n = n.parentNode) if (core.skipped(n)) return true; return false; }

// ---------- Strings in JavaScript ----------
const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '&&', '||', '??', '===', '!==', '==', '!=', 'return', 'typeof', 'case', '=>', 'of', 'in']);
export function tokenize(src) {
  const t = [];
  let i = 0;
  const last = () => t.length ? (t[t.length - 1].type === 'id' || t[t.length - 1].type === 'p' ? t[t.length - 1].v : 'x') : '(';
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, v = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { const n = src[j + 1]; v += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'u' ? String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)) : n; j += n === 'u' ? 6 : 2; continue; }
        if (src[j] === '\n') break;
        v += src[j++];
      }
      t.push({ type: 's', v }); i = j + 1; continue;
    }
    if (c === '`') {
      const parts = [], exprs = [];
      let j = i + 1, v = '';
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') { v += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          let depth = 1, k = j + 2;
          while (k < src.length && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; if (depth) k++; }
          parts.push(v); v = ''; exprs.push(src.slice(j + 2, k)); j = k + 1; continue;
        }
        v += src[j++];
      }
      parts.push(v);
      t.push({ type: 't', parts, exprs }); i = j + 1; continue;
    }
    if (c === '/' && REGEX_BEFORE.has(last())) {
      let j = i + 1, cls = false;
      while (j < src.length && (cls || src[j] !== '/') && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      j++; while (/[a-z]/i.test(src[j] || '')) j++;
      t.push({ type: 'r' }); i = j; continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
    if (id) { t.push({ type: 'id', v: id[0] }); i += id[0].length; continue; }
    const num = /^\d[\d.xa-fA-F_]*/.exec(src.slice(i, i + 40));
    if (num) { t.push({ type: 'n' }); i += num[0].length; continue; }
    const p = /^(===|!==|\?\?|\?\.|&&|\|\||=>|==|!=|<=|>=|\+\+|--|\+=|-=|\.\.\.|[^\s])/.exec(src.slice(i, i + 3));
    t.push({ type: 'p', v: p[0] }); i += p[0].length;
  }
  return t;
}

const STOP = new Set(['+', ',', ';', ')', ']', '}', ':', '?', '&&', '||', '??', '===', '!==', '==', '!=', '=', '+=', '=>']);
// Joins 'a' + x + 'b' into "a{0}b". Returns every such string in the source.
export function jsStrings(src) {
  const tokens = tokenize(src), out = [], used = new Set();
  const strOf = tok => tok.type === 's' ? { text: tok.v } : null;
  const templateText = (tok, ph) => {
    let s = tok.parts[0];
    tok.exprs.forEach((e, k) => { s += '{' + ph.n++ + '}' + tok.parts[k + 1]; out.push(...jsStrings(e)); });
    return s;
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if ((tok.type !== 's' && tok.type !== 't') || used.has(i)) continue;
    const ph = { n: 0 };
    let s = '';
    const prev = tokens[i - 1];
    if (prev && prev.type === 'p' && prev.v === '+') s += '{' + ph.n++ + '}';
    s += tok.type === 's' ? tok.v : templateText(tok, ph);
    let j = i + 1;
    while (tokens[j] && tokens[j].type === 'p' && tokens[j].v === '+') {
      const nx = tokens[j + 1];
      if (!nx) break;
      if (nx.type === 's' || nx.type === 't') { s += nx.type === 's' ? nx.v : templateText(nx, ph); used.add(j + 1); j += 2; continue; }
      // A value filled in by code: skip one operand.
      let k = j + 1, depth = 0;
      while (k < tokens.length) {
        const tk = tokens[k];
        if (tk.type === 'p') {
          if ('([{'.includes(tk.v)) depth++;
          else if (')]}'.includes(tk.v)) { if (depth === 0) break; depth--; }
          else if (depth === 0 && STOP.has(tk.v)) break;
        }
        k++;
      }
      s += '{' + ph.n++ + '}';
      j = k;
    }
    out.push(s);
  }
  return out;
}

const looksHtml = s => /<([a-z][a-z0-9]*)(\s[^>]*)?\/?>|<\/[a-z]+>/i.test(s);
// Strings that are code, not words: class names, CSS, paths, keys.
export function looksLikeText(s) {
  const t = core.norm(s);
  if (!core.translatable(t)) return false;
  const bare = t.replace(/\{\d+\}/g, '').trim();
  if (!bare) return false;
  if (/^[a-z0-9_$.:\/#?=&%\-\[\]*]+$/.test(bare)) return false;      // lowercase identifiers, paths
  if (/^[A-Z0-9_]+$/.test(bare) && bare.length > 1 && /_/.test(bare)) return false; // CONSTANTS
  if (/^[\w-]+\/[\w.+-]+$/.test(bare)) return false;                   // mime types
  if (/[{};]\s*$|^[.#@\[][\w-]|:\s*[\w#(.-]+\s*;|\d(px|em|rem|vh|vw|ms|s)\b|rgba?\(|var\(--/.test(bare)) return false; // CSS
  if (/^(\/|\.\/|https?:|mailto:|data:|#|&)/.test(bare)) return false;
  if (/[<>]|="|^\(.*:.*\)$/.test(bare)) return false;                 // markup bits, media queries
  if (/=>|\(\)|&&|\|\||===|^\w+\(|\w+\.\w+\(|^[\w.]+\s*=\s*/.test(bare)) return false;     // code
  if (/^[A-Z][a-z]+(-[A-Z][a-z]+)+$/.test(bare)) return false;        // header names
  if (/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(bare) && /-/.test(bare)) return false; // class lists
  if (/^[A-Za-z]+[A-Z][a-z]+[A-Za-z]*$/.test(bare) && !/\s/.test(bare)) return false; // camelCase
  return true;
}

export function keysOfJs(src) {
  const keys = new Set();
  for (const s of jsStrings(src)) {
    if (looksHtml(s)) { for (const k of keysOfTree(parseHtml(s), true)) keys.add(k); continue; }
    const text = decode(s);
    if (looksLikeText(text)) keys.add(core.norm(text));
  }
  return keys;
}

// ---------- The whole site ----------
function walkFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    if (SKIP_DIRS.has(rel.split(path.sep)[0])) continue;
    if (fs.statSync(full).isDirectory()) walkFiles(full, out); else out.push(rel);
  }
  return out;
}

// Map of key -> list of files it was found in.
export function siteKeys() {
  const found = new Map();
  const add = (keys, file) => { for (const k of keys) { if (!found.has(k)) found.set(k, new Set()); found.get(k).add(file); } };
  for (const file of walkFiles(ROOT)) {
    const src = file.endsWith('.html') || file.endsWith('.js') ? fs.readFileSync(path.join(ROOT, file), 'utf8') : null;
    if (src == null) continue;
    if (file.endsWith('.html')) {
      const tree = parseHtml(src);
      const title = allElements(tree).find(e => e.nodeName === 'TITLE');
      if (title && core.translatable(core.norm(title.textContent))) add([core.norm(title.textContent)], file);
      const body = allElements(tree).find(e => e.nodeName === 'BODY') || tree;
      add(keysOfTree(body), file);
      for (const el of allElements(tree)) {
        if (el.nodeName !== 'SCRIPT' || el.getAttribute('src') || /json/.test(el.getAttribute('type') || '')) continue;
        add(keysOfJs(el.textContent), file);
      }
    } else if (file.startsWith('assets/') && !SKIP_SCRIPTS.has(file) && !file.startsWith('assets/i18n/')) {
      add(keysOfJs(src), file);
    }
  }
  // Messages the server sends back for pages to show.
  for (const dir of ['api', 'lib']) {
    for (const file of listAll(path.join(ROOT, dir))) {
      const src = fs.readFileSync(file, 'utf8');
      add(serverMessages(src), path.relative(ROOT, file));
    }
  }
  const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/i18n/extra.json'), 'utf8'));
  add(extra.keys, 'assets/i18n/extra.json');
  const ignore = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/i18n/ignore.json'), 'utf8')).keys);
  for (const k of ignore) found.delete(k);
  return found;
}

function listAll(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listAll(full)); else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Strings given as error/message text in JSON answers.
export function serverMessages(src) {
  const keys = new Set();
  const re = /\b(error|message|reason|note)\s*:\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[3].replace(/\\(.)/g, '$1').replace(/\$\{[^}]*\}/g, '{0}');
    if (looksLikeText(s)) keys.add(core.norm(s));
  }
  return keys;
}

export function loadDict(lang) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/i18n', lang + '.json'), 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = siteKeys();
  if (process.argv.includes('--all')) {
    console.log(JSON.stringify([...keys.keys()], null, 1));
  } else {
    let missing = 0;
    for (const lang of LANGS) {
      let dict = {};
      try { dict = loadDict(lang); } catch {}
      for (const [k, files] of keys) if (!(k in dict)) { missing++; console.log(`${lang}\t${[...files][0]}\t${k}`); }
    }
    console.log(missing ? `${missing} missing` : 'All text is translated.');
  }
}
