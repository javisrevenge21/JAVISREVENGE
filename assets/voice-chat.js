/* "Ask Ryan": voice chat with Ryan Javi's AI. Loaded by site-ui.js for signed-in members.
   Talk (or type) a question; the answer is read out in a voice modeled on Ryan's.
   Members without REVENGE+ get one free question; REVENGE+ members ask as much as they like. */
(function () {
  if (window.__jrVoice) return; window.__jrVoice = true;
  var T = window.JR_THEME_RGB || '200,205,214';
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  var css = [
    '.jrv-open{position:fixed;z-index:71;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;height:44px;padding:0 16px 0 13px;border-radius:999px;border:1px solid rgba(' + T + ',.55);background:rgba(10,10,12,.86);color:#fff;font:600 12px ' + FONT + ';letter-spacing:.12em;text-transform:uppercase;cursor:pointer;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 20px rgba(0,0,0,.35),0 0 22px rgba(' + T + ',.22)}',
    '.jrv-open:hover{border-color:rgb(' + T + ')}.jrv-open svg,.jrv-mic svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    'body.app .jrv-open{bottom:72px}',
    '@media(max-width:640px){body.app .jrv-open{right:18px;bottom:calc(144px + env(safe-area-inset-bottom))}}',
    '.jrv{position:fixed;z-index:72;right:16px;bottom:72px;width:min(370px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 110px));display:flex;flex-direction:column;background:#0b0b0d;color:#fff;border:1px solid rgba(' + T + ',.5);border-radius:18px;box-shadow:0 22px 60px rgba(0,0,0,.6),0 0 34px rgba(' + T + ',.18);font:14px/1.5 ' + FONT + ';overflow:hidden;animation:jrvin .18s ease-out}',
    'body.app .jrv{bottom:128px}@media(max-width:640px){body.app .jrv{bottom:calc(200px + env(safe-area-inset-bottom));max-height:calc(100vh - 230px)}}',
    '@keyframes jrvin{from{opacity:0;transform:translateY(8px)}}',
    '.jrv-head{display:flex;align-items:center;gap:12px;padding:14px 14px 12px 16px;border-bottom:1px solid rgba(255,255,255,.09);background:linear-gradient(135deg,rgba(' + T + ',.28),rgba(' + T + ',.04))}',
    '.jrv-av{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;border:2px solid rgb(' + T + ');background:#000 url(/assets/icon-192.png) center/cover}',
    '.jrv-ttl{flex:1;min-width:0}.jrv-ttl b{display:block;font-size:13px;letter-spacing:.14em;text-transform:uppercase}.jrv-ttl span{font-size:12px;color:rgba(255,255,255,.62)}',
    '.jrv-x{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:transparent;color:#fff;font-size:18px;line-height:1;cursor:pointer}.jrv-x:hover{background:rgba(255,255,255,.08)}',
    '.jrv-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:120px}',
    '.jrv-msg{max-width:86%;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-break:break-word}',
    '.jrv-msg.u{align-self:flex-end;background:#fff;color:#000;border-bottom-right-radius:4px}',
    '.jrv-msg.a{align-self:flex-start;background:rgba(255,255,255,.06);border:1px solid rgba(' + T + ',.35);border-bottom-left-radius:4px}',
    '.jrv-msg.s{align-self:center;max-width:100%;text-align:center;font-size:12.5px;color:rgba(255,255,255,.6);padding:4px 6px}',
    '.jrv-play{display:inline-block;margin-left:8px;padding:0 7px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:none;color:#fff;font-size:11px;cursor:pointer;vertical-align:1px}',
    '.jrv-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:rgb(' + T + ');animation:jrvd 1s infinite}.jrv-dots span:nth-child(2){animation-delay:.15s}.jrv-dots span:nth-child(3){animation-delay:.3s}',
    '@keyframes jrvd{0%,100%{opacity:.25}50%{opacity:1}}',
    '.jrv-foot{padding:10px 12px 12px;border-top:1px solid rgba(255,255,255,.09)}',
    '.jrv-left{font-size:11.5px;letter-spacing:.06em;color:rgba(255,255,255,.6);margin:0 2px 8px;display:flex;justify-content:space-between;gap:8px}.jrv-left a{color:rgb(' + T + ');text-decoration:none;font-weight:600}.jrv-left a:hover{text-decoration:underline}',
    '.jrv-row{display:flex;gap:8px;align-items:center}',
    '.jrv-in{flex:1;min-width:0;height:42px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;font:14px ' + FONT + ';outline:none}.jrv-in:focus{border-color:rgb(' + T + ')}.jrv-in::placeholder{color:rgba(255,255,255,.45)}',
    '.jrv-mic,.jrv-send{flex:none;height:42px;border-radius:999px;cursor:pointer;font:600 12px ' + FONT + ';letter-spacing:.08em;text-transform:uppercase}',
    '.jrv-mic{width:42px;display:grid;place-items:center;border:1px solid rgba(' + T + ',.6);background:rgba(' + T + ',.14);color:#fff}.jrv-mic.on{background:rgb(' + T + ');color:#000;animation:jrvp 1.2s infinite}',
    '@keyframes jrvp{0%{box-shadow:0 0 0 0 rgba(' + T + ',.6)}100%{box-shadow:0 0 0 12px rgba(' + T + ',0)}}',
    '.jrv-send{padding:0 16px;border:1px solid #fff;background:#fff;color:#000}.jrv-send:disabled,.jrv-mic:disabled{opacity:.45;cursor:default}',
    '.jrv-lock{text-align:center;padding:4px 4px 2px}.jrv-lock p{margin:0 0 10px;color:rgba(255,255,255,.75);font-size:13px}',
    '.jrv-join{display:block;padding:12px;border-radius:12px;background:linear-gradient(135deg,rgb(' + T + '),rgba(' + T + ',.65));color:#000;font-weight:800;letter-spacing:.1em;text-transform:uppercase;font-size:12.5px;text-decoration:none}',
    '.jrv-note{font-size:10.5px;color:rgba(255,255,255,.4);text-align:center;margin-top:8px}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var KEY = 'jr_voice_chat';
  var state = { msgs: [], left: null, unlimited: false, free: 1, on: true, busy: false, open: false };
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.msgs)) state.msgs = saved.msgs.slice(-30); } catch (e) {}
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify({ msgs: state.msgs.slice(-30) })); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'jrv-open'; btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML = MIC + '<span>Ask Ryan</span>';
  document.body.appendChild(btn);

  var panel, log, input, mic, send, foot;
  btn.addEventListener('click', function () { state.open ? close() : open(); });

  function open() {
    state.open = true; btn.setAttribute('aria-expanded', 'true');
    panel = document.createElement('div');
    panel.className = 'jrv'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ask Ryan');
    panel.innerHTML =
      '<div class="jrv-head"><span class="jrv-av" aria-hidden="true"></span><div class="jrv-ttl"><b>Ask Ryan</b><span>Ryan Javi’s AI · voice modeled on Ryan</span></div><button class="jrv-x" type="button" aria-label="Close">×</button></div>' +
      '<div class="jrv-log" aria-live="polite"></div><div class="jrv-foot"></div>';
    document.body.appendChild(panel);
    log = panel.querySelector('.jrv-log'); foot = panel.querySelector('.jrv-foot');
    panel.querySelector('.jrv-x').onclick = close;
    document.addEventListener('keydown', onKey);
    render(); renderFoot();
    fetch('/api/voice-chat', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      state.left = d.left; state.unlimited = d.unlimited; state.free = d.free; state.on = d.on;
      renderFoot();
    }).catch(function () {});
  }
  function close() {
    state.open = false; btn.setAttribute('aria-expanded', 'false');
    stopListening(); stopAudio();
    document.removeEventListener('keydown', onKey);
    if (panel) panel.remove(); panel = null;
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function render() {
    if (!log) return;
    var html = '';
    if (!state.msgs.length) html += '<div class="jrv-msg a">Yo, it’s Ryan’s AI. Ask me anything about JAVISREVENGE, the Wall, politics or REVENGE+, and I’ll answer out loud.</div>';
    state.msgs.forEach(function (m, i) {
      html += '<div class="jrv-msg ' + (m.role === 'user' ? 'u' : m.role === 'assistant' ? 'a' : 's') + '">' + esc(m.content) +
        (m.role === 'assistant' ? '<button class="jrv-play" type="button" data-i="' + i + '" aria-label="Play answer">▶</button>' : '') + '</div>';
    });
    if (state.busy) html += '<div class="jrv-msg a jrv-dots" aria-label="Thinking"><span></span><span></span><span></span></div>';
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
    Array.prototype.forEach.call(log.querySelectorAll('.jrv-play'), function (b) { b.onclick = function () { play(state.msgs[+b.dataset.i]); }; });
  }

  function renderFoot() {
    if (!foot) return;
    var locked = !state.unlimited && state.left === 0;
    if (locked) {
      foot.innerHTML = '<div class="jrv-lock"><p>You used your free question. REVENGE+ members can ask me anything, as much as they want.</p><a class="jrv-join" href="/wall?view=plus">Join REVENGE+ ✦</a></div><div class="jrv-note">AI answers can be wrong. Not actually Ryan.</div>';
      return;
    }
    var status = state.unlimited ? '<span>✦ REVENGE+ · unlimited questions</span>'
      : (state.left == null ? '<span>&nbsp;</span>' : '<span>' + state.left + ' free question' + (state.left === 1 ? '' : 's') + ' left</span><a href="/wall?view=plus">Unlimited with REVENGE+ ✦</a>');
    foot.innerHTML = '<div class="jrv-left">' + status + '</div><div class="jrv-row">' +
      (SR ? '<button class="jrv-mic" type="button" aria-label="Talk">' + MIC + '</button>' : '') +
      '<input class="jrv-in" type="text" maxlength="500" placeholder="' + (SR ? 'Tap the mic or type…' : 'Type your question…') + '" aria-label="Your question">' +
      '<button class="jrv-send" type="button">Ask</button></div><div class="jrv-note">AI answers can be wrong. Not actually Ryan.</div>';
    input = foot.querySelector('.jrv-in'); send = foot.querySelector('.jrv-send'); mic = foot.querySelector('.jrv-mic');
    send.onclick = ask;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); ask(); } };
    if (mic) mic.onclick = function () { rec ? stopListening() : listen(); };
    if (!state.on) { input.disabled = send.disabled = true; if (mic) mic.disabled = true; input.placeholder = 'Ask Ryan is switching on soon'; }
    setBusy(state.busy);
  }
  function setBusy(b) {
    state.busy = b;
    if (send) send.disabled = b || !state.on; if (mic) mic.disabled = b || !state.on; if (input) input.disabled = b || !state.on;
  }

  function ask() {
    if (state.busy || !input) return;
    var q = input.value.trim();
    if (!q) { input.focus(); return; }
    stopListening(); stopAudio(); unlockAudio();
    input.value = '';
    state.msgs.push({ role: 'user', content: q }); persist();
    setBusy(true); render();
    var history = state.msgs.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-10)
      .map(function (m) { return { role: m.role, content: m.content }; });
    fetch('/api/voice-chat', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); }).then(function (x) {
      var d = x.d || {};
      if (!x.ok) {
        if (x.status === 402) { state.left = 0; state.unlimited = false; }
        state.msgs.push({ role: 'system', content: d.message || d.error || 'Something went wrong. Try again.' });
        if (x.status === 402) state.msgs.splice(state.msgs.length - 2, 1); // drop the question that wasn't answered
        return;
      }
      var m = { role: 'assistant', content: d.reply, audio: d.audio || null };
      state.msgs.push(m);
      state.left = d.left; state.unlimited = d.unlimited;
      play(m);
    }).catch(function () {
      state.msgs.push({ role: 'system', content: 'Connection problem. Try again in a moment.' });
    }).then(function () {
      state.msgs.forEach(function (m, i) { if (i < state.msgs.length - 1) delete m.audio; }); // keep memory light
      persist(); setBusy(false); render(); renderFoot();
      if (input) input.focus();
    });
  }

  /* ---- Listening: the browser's speech recognition turns the question into text ---- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  function listen() {
    if (!SR || state.busy) return;
    stopAudio(); unlockAudio();
    try { rec = new SR(); } catch (e) { rec = null; return; }
    rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
    var finalText = '';
    if (mic) mic.classList.add('on');
    if (input) input.placeholder = 'Listening…';
    rec.onresult = function (e) {
      var text = '';
      for (var i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; if (e.results[i].isFinal) finalText = text; }
      if (input) input.value = text;
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { state.msgs.push({ role: 'system', content: 'Microphone is blocked. Allow it in your browser, or type your question.' }); render(); }
    };
    rec.onend = function () {
      rec = null;
      if (mic) mic.classList.remove('on');
      if (input) input.placeholder = 'Tap the mic or type…';
      if (finalText.trim() && input) { input.value = finalText.trim(); ask(); }
    };
    try { rec.start(); } catch (e) { rec = null; if (mic) mic.classList.remove('on'); }
  }
  function stopListening() { if (rec) { try { rec.stop(); } catch (e) {} } }

  /* ---- Speaking: Ryan's AI voice from the server, or the browser's own voice as a fallback ---- */
  var player = null;
  // Phones only let audio play after a tap, so warm up the player on the tap that sends the question.
  function unlockAudio() {
    if (!player) player = new Audio();
    try { player.muted = true; var p = player.play(); if (p && p.catch) p.catch(function () {}); player.pause(); player.muted = false; } catch (e) {}
  }
  function pauseMusic() { Array.prototype.forEach.call(document.querySelectorAll('audio'), function (a) { if (a !== player && !a.paused) { a.dataset.jrvPaused = '1'; a.pause(); } }); }
  function resumeMusic() { Array.prototype.forEach.call(document.querySelectorAll('audio[data-jrv-paused]'), function (a) { delete a.dataset.jrvPaused; var p = a.play(); if (p && p.catch) p.catch(function () {}); }); }
  function play(m) {
    if (!m) return;
    stopAudio();
    if (m.audio) {
      if (!player) player = new Audio();
      player.src = m.audio; pauseMusic();
      player.onended = resumeMusic;
      var p = player.play(); if (p && p.catch) p.catch(function () { browserVoice(m.content); });
      return;
    }
    browserVoice(m.content);
  }
  function browserVoice(text) {
    if (!window.speechSynthesis || !text) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || 'en-US';
    pauseMusic(); u.onend = resumeMusic;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }
  function stopAudio() {
    if (player) { try { player.pause(); } catch (e) {} }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
})();
