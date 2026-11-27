/* JAVISREVENGE site languages.
 *
 * Every page loads this file in its <head>. The member's language comes from
 * the jr_lang cookie (set from their account at sign-in and whenever they
 * change it), then this browser's last choice, then English.
 *
 * How text gets translated: the page is written in English. After it loads,
 * every piece of text on it, including anything scripts add later, is looked
 * up in /assets/i18n/<lang>.json and swapped for the translation. A sentence
 * with links or bold words inside is looked up as one unit, written like
 * "Read the <0>Terms</0>." so translators can move the link where their
 * language needs it. Values filled in by code use {0}, {1}...
 *
 * `npm test` (test/i18n.test.js) fails if any English text on the site has no
 * translation in all four languages, so new pages and features stay covered.
 * Text written by people (fan uploads, posts, the latest Instagram caption)
 * is translated on the fly when AUTO_TRANSLATE=on is set in Vercel.
 *
 * Add translate="no" (or class "notranslate") to anything that must stay as
 * written, like names and usernames.
 */
(function (root) {
  'use strict';
  var LANGS = {
    en: { name: 'English', dir: 'ltr' },
    es: { name: 'Español', dir: 'ltr' },
    he: { name: 'עברית', dir: 'rtl' },
    fa: { name: 'فارسی', dir: 'rtl' },
    ar: { name: 'العربية', dir: 'rtl' }
  };
  var INLINE = { A: 1, ABBR: 1, B: 1, BDI: 1, CITE: 1, DATA: 1, DFN: 1, EM: 1, I: 1, KBD: 1, MARK: 1, Q: 1, S: 1, SAMP: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1, TIME: 1, U: 1, VAR: 1, CODE: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, svg: 1, TEXTAREA: 1, IFRAME: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, PRE: 1, OBJECT: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function norm(s) { return String(s == null ? '' : s).replace(/[\s ​]+/g, ' ').trim(); }
  function attr(el, name) { return el.getAttribute ? el.getAttribute(name) : null; }

  // Text worth translating: has a letter, and isn't only a handle, link,
  // email address or a {0} placeholder.
  function translatable(key) {
    var bare = norm(String(key).replace(/<\/?\d+\/?>/g, ' ').replace(/\{\d+\}/g, ' '));
    if (!/[A-Za-zÀ-ɏ]/.test(bare)) return false;
    if (/^@[\w.]+$/.test(bare) || /^(https?:\/\/|www\.)\S+$/i.test(bare) || /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(bare)) return false;
    return true;
  }

  function skipped(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP[el.nodeName]) return true;
    var t = attr(el, 'translate');
    if (t === 'no') return true;
    var c = attr(el, 'class');
    if (c && /(^|\s)notranslate(\s|$)/.test(c)) return true;
    return attr(el, 'data-i18n-skip') != null;
  }
  function insideSkipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) if (skipped(n)) return true;
    return false;
  }

  // An inline child holding only text, so its words can move inside the sentence.
  function simpleInline(el) {
    if (!INLINE[el.nodeName] || skipped(el)) return false;
    var kids = el.childNodes;
    for (var i = 0; i < kids.length; i++) if (kids[i].nodeType !== 3) return false;
    return true;
  }

  // The unit key of an element: its direct text, with child elements as
  // numbered tokens. Returns null when the element has no text of its own.
  // (loose: used by the text finder, where {0} may stand for HTML.)
  function unitKey(el, loose) {
    if (skipped(el)) return null;
    var kids = el.childNodes, out = '', n = 0, hasText = false;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        out += k.nodeValue;
        if (norm(k.nodeValue) && !(loose && /^[\s{}\d\W]*$/.test(k.nodeValue) && /\{\d+\}/.test(k.nodeValue))) hasText = true;
      }
      else if (k.nodeType === 1) {
        if (k.nodeName === 'BR' || !simpleInline(k) || !norm(k.textContent)) out += '<' + n + '/>';
        else out += '<' + n + '>' + norm(k.textContent) + '</' + n + '>';
        n++;
      }
    }
    if (!hasText) return null;
    var key = norm(out);
    return translatable(key) ? key : null;
  }

  // Calls fn(element, key) for every unit inside root (root included).
  function walk(rootEl, fn, loose) {
    if (!rootEl || rootEl.nodeType !== 1 || skipped(rootEl)) return;
    var key = unitKey(rootEl, loose);
    if (key) fn(rootEl, key);
    var kids = rootEl.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType !== 1) continue;
      if (key && simpleInline(k)) continue; // already part of the parent's sentence
      walk(k, fn, loose);
    }
  }

  function attrKeys(el) {
    var out = [];
    for (var i = 0; i < ATTRS.length; i++) {
      var v = attr(el, ATTRS[i]);
      if (v && translatable(norm(v))) out.push([ATTRS[i], norm(v)]);
    }
    if (el.nodeName === 'INPUT' && /^(button|submit|reset)$/i.test(attr(el, 'type') || '')) {
      var val = attr(el, 'value');
      if (val && translatable(norm(val))) out.push(['value', norm(val)]);
    }
    return out;
  }

  // ---- Dictionary lookups, with {0} templates ----
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function Dict(map) {
    this.map = map || {};
    this.templates = [];
    for (var k in this.map) {
      if (!/\{\d+\}/.test(k)) continue;
      var order = [], src = '^' + k.split(/(\{\d+\})/).map(function (part, i, parts) {
        var m = /^\{(\d+)\}$/.exec(part);
        // Right after a word (member{1}) the value may be empty: an English plural "s".
        if (m) { order.push(+m[1]); if (!/[A-Za-z]$/.test(parts[i - 1] || '')) return '([\\s\\S]+?)';
          return parts[i + 1] === '' && parts[i + 2] ? '((?:e?s)?)' : '([\\s\\S]*?)'; }
        return escapeRe(part);
      }).join('') + '$';
      this.templates.push({ key: k, re: new RegExp(src), order: order, fixed: k.replace(/\{\d+\}/g, '').length });
    }
    this.templates.sort(function (a, b) { return b.fixed - a.fixed; });
  }
  Dict.prototype.lookup = function (key) {
    if (Object.prototype.hasOwnProperty.call(this.map, key)) return this.map[key];
    for (var i = 0; i < this.templates.length; i++) {
      var t = this.templates[i], m = t.re.exec(key);
      if (!m) continue;
      var vals = {};
      for (var j = 0; j < t.order.length; j++) vals[t.order[j]] = m[j + 1];
      var map = this.map;
      // A value that is itself site text (" · votes are anonymous") is translated too.
      return map[t.key].replace(/\{(\d+)\}/g, function (all, d) {
        if (!(d in vals)) return all;
        var v = vals[d], core = v.trim();
        return core && Object.prototype.hasOwnProperty.call(map, core) ? v.replace(core, map[core]) : v;
      });
    }
    return null;
  };

  // Splits "a <0>b</0> c<1/>" into [text, {n, inner}, ...].
  function parseUnit(s) {
    var out = [], re = /<(\d+)\/>|<(\d+)>([\s\S]*?)<\/\2>/g, last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      out.push(m[1] != null ? { n: +m[1] } : { n: +m[2], inner: m[3] });
      last = re.lastIndex;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  }

  // Puts a translation into a unit, reusing its own child elements (links,
  // buttons) so their links and click handlers keep working.
  function apply(el, translation, makeText) {
    var parts = parseUnit(translation), kids = [], els = [], used = {};
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 1) els.push(el.childNodes[i]);
    var head = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.nodeValue.match(/^\s*/)[0] : '';
    var tail = el.lastChild && el.lastChild.nodeType === 3 ? el.lastChild.nodeValue.match(/\s*$/)[0] : '';
    parts.forEach(function (p) {
      if (typeof p === 'string') { kids.push(makeText(p)); return; }
      var child = els[p.n];
      if (!child || used[p.n]) return;
      used[p.n] = 1;
      if (p.inner != null && simpleInline(child)) child.textContent = p.inner;
      kids.push(child);
    });
    els.forEach(function (c, i) { if (!used[i]) kids.push(c); });
    if (head && kids[0] && kids[0].nodeType === 3) kids[0].nodeValue = head + kids[0].nodeValue;
    if (tail && kids.length && kids[kids.length - 1].nodeType === 3) kids[kids.length - 1].nodeValue += tail;
    while (el.firstChild) el.removeChild(el.firstChild);
    kids.forEach(function (k) { el.appendChild(k); });
  }

  var core = { apply: apply, LANGS: LANGS, norm: norm, unitKey: unitKey, walk: walk, attrKeys: attrKeys, translatable: translatable, Dict: Dict, parseUnit: parseUnit, skipped: skipped };
  root.JRI18N = { core: core, lang: 'en', LANGS: LANGS };
  if (typeof document === 'undefined') return;

  // ================= Browser =================
  var doc = document, html = doc.documentElement;
  function readCookie(name) {
    var m = doc.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function store(lang) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    doc.cookie = 'jr_lang=' + lang + '; Path=/; Max-Age=31536000; SameSite=Lax' + secure;
    try { localStorage.setItem('jr_lang', lang); } catch (e) {}
  }
  var lang = readCookie('jr_lang');
  if (!LANGS[lang]) { try { lang = localStorage.getItem('jr_lang'); } catch (e) { lang = null; } }
  if (!LANGS[lang]) lang = 'en';

  var api = root.JRI18N;
  api.lang = lang;
  api.dir = LANGS[lang].dir;
  // Save a choice in this browser (the account copy is saved by the API).
  api.remember = store;
  // Translate one English string from code, e.g. JRI18N.t('Saved').
  api.t = function (s) { return s; };
  // Fills a <select> with the five languages (each in its own script) and
  // calls onPick(code) when the member picks one.
  api.picker = function (select, onPick) {
    select.setAttribute('translate', 'no');
    select.innerHTML = '';
    Object.keys(LANGS).forEach(function (code) {
      var o = doc.createElement('option');
      o.value = code; o.textContent = LANGS[code].name; o.lang = code;
      if (code === lang) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', function () { if (LANGS[select.value]) onPick(select.value); });
  };
  // Dates and numbers shown with the browser's default format follow the site language.
  if (lang !== 'en') {
    [[Date.prototype, ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']], [Number.prototype, ['toLocaleString']]].forEach(function (pair) {
      pair[1].forEach(function (name) {
        var original = pair[0][name];
        pair[0][name] = function (locales) {
          var args = [].slice.call(arguments);
          if (locales == null) args[0] = lang;
          return original.apply(this, args);
        };
      });
    });
  }
  html.setAttribute('lang', lang);
  html.setAttribute('dir', LANGS[lang].dir);
  if (lang === 'en') return;

  // Right-to-left and Arabic-script fixes, and hide the page until it's translated.
  var css = doc.createElement('style');
  css.id = 'jr-i18n-style';
  css.textContent = 'html.jr-i18n-wait body{visibility:hidden}' +
    (LANGS[lang].dir === 'rtl' ? 'html[dir=rtl] body{text-align:right}html[dir=rtl] input,html[dir=rtl] textarea{text-align:right}' +
      'html[dir=rtl] input[type=email],html[dir=rtl] input[type=url],html[dir=rtl] .jr-ltr{direction:ltr;text-align:left}' : '') +
    (lang === 'ar' || lang === 'fa' ? 'html[lang=ar] body *,html[lang=fa] body *{letter-spacing:0!important}' : '');
  (doc.head || html).appendChild(css);
  html.classList.add('jr-i18n-wait');
  function reveal() { html.classList.remove('jr-i18n-wait'); }
  var revealTimer = setTimeout(reveal, 2500);

  var dict = null, busy = false, done = new WeakMap(), doneAttr = new WeakMap();
  var auto = { queue: {}, timer: null, cache: {}, off: false };
  try { auto.off = sessionStorage.getItem('jr_auto_off') === '1'; } catch (e) {}
  try { auto.cache = JSON.parse(sessionStorage.getItem('jr_auto_' + lang) || '{}'); } catch (e) {}

  function applyUnit(el, translation) {
    core.apply(el, translation, function (t) { return doc.createTextNode(t); });
    done.set(el, norm(el.textContent));
  }

  function wantsAuto(el, key) {
    // Machine translation only for sentences (3+ words) or marked containers,
    // so names and short labels are never guessed at.
    if (auto.off) return false;
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) if (n.hasAttribute && n.hasAttribute('data-i18n-auto')) return true;
    return key.replace(/<\/?\d+\/?>/g, ' ').split(/\s+/).filter(function (w) { return /[A-Za-z]{2}/.test(w); }).length >= 3;
  }

  function translateEl(el) {
    walk(el, function (unit, key) {
      if (done.get(unit) === norm(unit.textContent)) return;
      var t = dict.lookup(key);
      if (t == null && auto.cache[key] != null) t = auto.cache[key];
      if (t != null) applyUnit(unit, t);
      else if (wantsAuto(unit, key)) requestAuto(unit, key);
    });
    var els = [el];
    if (el.querySelectorAll) els = els.concat([].slice.call(el.querySelectorAll('[placeholder],[title],[aria-label],[alt],input[value]')));
    els.forEach(function (e) { if (!insideSkipped(e)) translateAttrs(e); });
  }

  function translateAttrs(e) {
    var seen = doneAttr.get(e) || {};
    attrKeys(e).forEach(function (pair) {
      if (seen[pair[0]] === pair[1]) return;
      var t = dict.lookup(pair[1]);
      if (t == null) return;
      var out = norm(t.replace(/<\/?\d+\/?>/g, ''));
      seen[pair[0]] = out;
      e.setAttribute(pair[0], out);
    });
    doneAttr.set(e, seen);
  }

  function requestAuto(unit, key) {
    (auto.queue[key] = auto.queue[key] || []).push(unit);
    clearTimeout(auto.timer);
    auto.timer = setTimeout(flushAuto, 400);
  }
  function flushAuto() {
    var batch = auto.queue, keys = Object.keys(batch).slice(0, 40);
    auto.queue = {};
    if (!keys.length) return;
    fetch('/api/account/preferences', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translate: keys, language: lang })
    }).then(function (r) { return r.ok ? r.json() : { off: true }; })
      .then(function (d) {
        if (d && d.off) { auto.off = true; try { sessionStorage.setItem('jr_auto_off', '1'); } catch (e) {} return; }
        var out = (d && d.translations) || {};
        run(function () {
          keys.forEach(function (k) {
            if (typeof out[k] !== 'string') return;
            auto.cache[k] = out[k];
            (batch[k] || []).forEach(function (u) { if (u.isConnected) applyUnit(u, out[k]); });
          });
        });
        try { sessionStorage.setItem('jr_auto_' + lang, JSON.stringify(auto.cache)); } catch (e) {}
      }).catch(function () {});
  }

  function run(fn) { busy = true; try { fn(); } finally { observer.takeRecords(); busy = false; } }

  // The nearest element whose sentence a changed node belongs to.
  function unitOf(t) {
    var start = t;
    while (start.parentNode && start.parentNode.nodeType === 1 && simpleInline(start) && unitKey(start.parentNode)) start = start.parentNode;
    return start;
  }
  var observer = new MutationObserver(function (records) {
    if (busy || !dict) return;
    run(function () {
      records.forEach(function (r) {
        var t = r.type === 'characterData' ? r.target.parentNode : r.target;
        if (!t || t.nodeType !== 1 || !t.isConnected || insideSkipped(t)) return;
        if (r.type === 'attributes') { translateAttrs(t); return; }
        var u = unitOf(t);
        if (unitKey(u)) translateEl(u);
        if (r.type === 'childList') {
          for (var i = 0; i < r.addedNodes.length; i++) {
            var a = r.addedNodes[i];
            if (a.nodeType === 1 && a.isConnected) translateEl(a);
          }
        }
      });
      if (doc.title !== titleDone) translateTitle();
    });
  });

  var titleDone = '';
  function translateTitle() {
    var t = dict.lookup(norm(doc.title));
    if (t != null) doc.title = norm(t.replace(/<\/?\d+\/?>/g, ''));
    titleDone = doc.title;
  }

  function start() {
    if (!dict || !doc.body) return;
    run(function () { translateTitle(); translateEl(doc.body); });
    observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) });
    clearTimeout(revealTimer);
    reveal();
  }

  api.t = function (s) {
    if (!dict) return s;
    var t = dict.lookup(norm(s));
    return t == null ? s : t.replace(/<\/?\d+\/?>/g, '');
  };
  // Popups (alert/confirm/prompt) aren't page text, so translate them here.
  ['alert', 'confirm', 'prompt'].forEach(function (name) {
    var original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function (message) {
      var args = [].slice.call(arguments);
      if (typeof message === 'string') {
        var whole = api.t(message);
        args[0] = whole !== message ? whole : message.split('\n\n').map(function (p) { return api.t(p); }).join('\n\n');
      }
      return original.apply(window, args);
    };
  });

  var ready = doc.readyState !== 'loading';
  if (!ready) doc.addEventListener('DOMContentLoaded', function () { ready = true; start(); });
  fetch('/assets/i18n/' + lang + '.json', { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
    .then(function (map) { dict = new Dict(map); api.ready = true; if (ready) start(); })
    .catch(function () { clearTimeout(revealTimer); reveal(); });
})(typeof window !== 'undefined' ? window : globalThis);
