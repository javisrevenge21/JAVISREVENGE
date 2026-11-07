// Site music. Loops one track on every page that includes this script.
// Browsers block sound until the visitor interacts with the page, so the
// track starts on the first tap, click or key press. A speaker button
// turns it on/off; the choice and the playback position are remembered, so
// moving between pages continues the song instead of restarting it.
(function () {
  var SRC = '/assets/theme.mp3';
  var VOLUME = 0.35;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var muted = store.get('jr_music_muted') === '1';
  var audio = new Audio(SRC);
  audio.loop = true; audio.preload = 'auto'; audio.volume = VOLUME;
  var resumeAt = parseFloat(store.sget('jr_music_time') || '0');
  audio.addEventListener('loadedmetadata', function () { if (resumeAt && resumeAt < audio.duration) audio.currentTime = resumeAt; });
  setInterval(function () { if (!audio.paused) store.sset('jr_music_time', String(audio.currentTime)); }, 1000);
  window.addEventListener('pagehide', function () { store.sset('jr_music_time', String(audio.currentTime)); });

  var style = document.createElement('style');
  style.textContent = '.jr-music{position:fixed;z-index:70;left:16px;bottom:16px;display:flex;align-items:center;gap:8px;height:44px;padding:0 14px 0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(10,10,12,.82);color:#fff;font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.08em;cursor:pointer;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 20px rgba(0,0,0,.35)}' +
    '.jr-music:hover{border-color:rgba(255,255,255,.45)}.jr-music svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.jr-bars{display:flex;align-items:flex-end;gap:2px;height:14px}.jr-bars i{width:3px;background:#fff;border-radius:2px;animation:jrb 1s ease-in-out infinite}.jr-bars i:nth-child(2){animation-delay:.2s}.jr-bars i:nth-child(3){animation-delay:.4s}' +
    '@keyframes jrb{0%,100%{height:4px}50%{height:14px}}.jr-music.off .jr-bars{display:none}.jr-music.wait .jr-bars i{animation:none;height:4px}' +
    'body.app .jr-music{background:rgba(255,255,255,.95);color:#0f1419;border-color:#e6e8ec}body.app .jr-music svg{stroke:#0f1419}body.app .jr-bars i{background:#0f1419}' +
    '@media(max-width:640px){body.app .jr-music{bottom:calc(76px + env(safe-area-inset-bottom))}.jr-music .jr-lbl{display:none}}' +
    '@media(prefers-reduced-motion:reduce){.jr-bars i{animation:none;height:8px}}';
  document.head.appendChild(style);

  var ON = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var OFF = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'jr-music';

  function draw() {
    var playing = !audio.paused;
    btn.className = 'jr-music' + (muted ? ' off' : playing ? '' : ' wait');
    btn.innerHTML = (muted ? OFF : ON) + '<span class="jr-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="jr-lbl">' + (muted ? 'MUSIC OFF' : playing ? 'MUSIC ON' : 'TAP FOR MUSIC') + '</span>';
    btn.setAttribute('aria-label', muted ? 'Turn music on' : 'Turn music off');
    btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
  }
  function play() { if (muted) return; audio.play().then(draw, draw); }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    muted = !muted; store.set('jr_music_muted', muted ? '1' : '0');
    if (muted) audio.pause(); else play();
    draw();
  });
  audio.addEventListener('play', draw); audio.addEventListener('pause', draw);

  // Try right away (works if the browser allows it), then on first interaction.
  function firstTouch() { play(); ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.removeEventListener(ev, firstTouch, true); }); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, firstTouch, true); });

  // Pause the music while any video on the page is playing, then resume.
  var pausedForVideo = false;
  document.addEventListener('play', function (e) { if (e.target.tagName === 'VIDEO' && !audio.paused) { pausedForVideo = true; audio.pause(); } }, true);
  ['pause', 'ended'].forEach(function (ev) { document.addEventListener(ev, function (e) {
    if (e.target.tagName === 'VIDEO' && pausedForVideo) {
      var any = Array.prototype.some.call(document.querySelectorAll('video'), function (v) { return !v.paused; });
      if (!any) { pausedForVideo = false; play(); }
    }
  }, true); });

  function mount() { document.body.appendChild(btn); draw(); play(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
