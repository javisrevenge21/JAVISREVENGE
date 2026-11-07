// Site music. Loops one track on every page that includes this script.
// Browsers block sound until the visitor interacts with the page, so the
// track starts on the first tap, click or key press. A speaker button
// turns it on/off; the choice and the playback position are remembered, so
// moving between pages continues the song instead of restarting it.
(function () {
  var SRC = '/assets/theme.mp3';
  var TRACK = {
    title: 'Off The Grid (Instrumental)',
    artist: 'Kanye West',
    featuring: 'Playboi Carti & Fivio Foreign',
    album: 'Donda',
    year: '2021',
    label: 'GOOD Music / Def Jam Recordings',
    producers: 'Kanye West, 30 Roc, AyoAA, David x Eli, Ojivolta & Sloane',
    q: 'Off The Grid Kanye West Playboi Carti Fivio Foreign'
  };
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
  style.textContent = style.textContent.replace('.jr-music{position:fixed;z-index:70;left:16px;bottom:16px;', '.jr-music{position:relative;') +
    '.jr-music-wrap{position:fixed;z-index:70;left:16px;bottom:16px;display:flex;gap:6px;align-items:center}' +
    '.jr-music-info{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(10,10,12,.82);cursor:pointer;display:grid;place-items:center;backdrop-filter:blur(12px)}.jr-music-info svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round}' +
    '.jr-credits{position:absolute;left:0;bottom:54px;width:min(340px,calc(100vw - 32px));padding:16px;border-radius:18px;background:#0e0f12;color:#fff;border:1px solid rgba(255,255,255,.16);box-shadow:0 18px 50px rgba(0,0,0,.55);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:jrc .16s ease-out}' +
    '@keyframes jrc{from{opacity:0;transform:translateY(6px)}}' +
    '.jr-c-top{display:flex;gap:12px;align-items:center;margin-bottom:12px}.jr-c-top>span:nth-child(2){min-width:0;flex:1;display:flex;flex-direction:column}' +
    '.jr-c-art{width:52px;height:52px;flex:none;border-radius:10px;display:grid;place-items:center;font-size:26px;background:linear-gradient(135deg,#3a3a3f,#0b0b0d);border:1px solid rgba(255,255,255,.15)}' +
    '.jr-c-top small{font-size:10px;letter-spacing:.18em;color:rgba(255,255,255,.5);font-weight:700}.jr-c-top b{font-size:15px}.jr-c-top span span{color:rgba(255,255,255,.7);font-size:13px}' +
    '.jr-c-x{align-self:flex-start;width:28px;height:28px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}' +
    '.jr-credits dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:13px}.jr-credits dt{color:rgba(255,255,255,.5)}.jr-credits dd{margin:0}' +
    '.jr-c-note{margin:12px 0 0;font-size:11.5px;color:rgba(255,255,255,.5)}' +
    '.jr-c-links{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px}.jr-c-links a{padding:9px;border-radius:10px;text-align:center;text-decoration:none;color:#fff;font-weight:700;font-size:13px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}.jr-c-links a:hover{background:rgba(255,255,255,.16)}' +
    '.jr-c-links a:first-child{background:#1db954;border-color:#1db954;color:#000}.jr-c-links a:nth-child(2){background:#fa2d48;border-color:#fa2d48}' +
    'body.app .jr-music-info{background:rgba(255,255,255,.95);border-color:#e6e8ec}body.app .jr-music-info svg{stroke:#0f1419}' +
    '@media(max-width:640px){body.app .jr-music-wrap{bottom:calc(76px + env(safe-area-inset-bottom))}.jr-music .jr-lbl{display:none}}';
  document.head.appendChild(style);

  var ON = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var OFF = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
  var wrap = document.createElement('div'); wrap.className = 'jr-music-wrap';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'jr-music';
  var info = document.createElement('button');
  info.type = 'button'; info.className = 'jr-music-info'; info.setAttribute('aria-label', 'Song credits'); info.setAttribute('aria-expanded', 'false');
  info.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  var card = document.createElement('div'); card.className = 'jr-credits'; card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Now playing');
  var qs = encodeURIComponent(TRACK.q);
  card.innerHTML =
    '<div class="jr-c-top"><span class="jr-c-art">♪</span><span><small>NOW PLAYING</small><b>' + TRACK.title + '</b><span>' + TRACK.artist + ' feat. ' + TRACK.featuring + '</span></span><button type="button" class="jr-c-x" aria-label="Close">✕</button></div>' +
    '<dl><dt>Artist</dt><dd>' + TRACK.artist + '</dd><dt>Featuring</dt><dd>' + TRACK.featuring + '</dd><dt>Album</dt><dd>' + TRACK.album + ' (' + TRACK.year + ')</dd>' +
    '<dt>Producers</dt><dd>' + TRACK.producers + '</dd><dt>Label</dt><dd>' + TRACK.label + '</dd></dl>' +
    '<p class="jr-c-note">All rights belong to the artists and rights holders. Used with permission.</p>' +
    '<div class="jr-c-links"><a target="_blank" rel="noopener" href="https://open.spotify.com/search/' + qs + '">Spotify</a><a target="_blank" rel="noopener" href="https://music.apple.com/us/search?term=' + qs + '">Apple Music</a><a target="_blank" rel="noopener" href="https://music.youtube.com/search?q=' + qs + '">YouTube Music</a><a target="_blank" rel="noopener" href="https://tidal.com/search?q=' + qs + '">Tidal</a></div>';
  function toggleCard(open) { card.hidden = !open; info.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  info.addEventListener('click', function (e) { e.stopPropagation(); toggleCard(card.hidden); });
  card.addEventListener('click', function (e) { e.stopPropagation(); if (e.target.closest('.jr-c-x')) toggleCard(false); });
  document.addEventListener('click', function () { toggleCard(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleCard(false); });
  wrap.appendChild(card); wrap.appendChild(btn); wrap.appendChild(info);

  function draw() {
    var playing = !audio.paused;
    btn.className = 'jr-music' + (muted ? ' off' : playing ? '' : ' wait');
    btn.innerHTML = (muted ? OFF : ON) + '<span class="jr-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="jr-lbl">' + (muted ? 'MUSIC OFF' : playing ? 'OFF THE GRID · KANYE WEST' : 'TAP FOR MUSIC') + '</span>';
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

  function mount() { document.body.appendChild(wrap); draw(); play(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
