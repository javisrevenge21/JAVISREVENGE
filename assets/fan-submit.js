// Archives page: "Send it in". Members send photos, videos and files for the
// owner to repost on Instagram. Files go straight from the browser to private
// Vercel Blob storage (through /api/community?upload=1), then the submission
// is saved with action "submit". The owner also gets an inbox on this page.
(function () {
  'use strict';
  var MAX_FILES = 5, MAX_BYTES = 100 * 1048576;
  var TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf|audio\/(mpeg|mp4|x-m4a))$/;
  var EXT_TYPES = { heic: 'image/heic', heif: 'image/heif', mov: 'video/quicktime', m4a: 'audio/x-m4a' };
  var blobLib = null;
  function uploader() { return blobLib || (blobLib = import('https://esm.sh/@vercel/blob@2.8.0/client')); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function typeOf(file) {
    if (file.type) return file.type;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    return EXT_TYPES[ext] || '';
  }
  function post(body) {
    return fetch('/api/community', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.'); return d; }); });
  }

  // ---- The form ----
  var form = $('fanForm');
  if (form) {
    var input = $('fanFiles'), prev = $('fanPrev'), send = $('fanSend'), consent = $('fanConsent'), status = $('fanStatus');
    var items = [];
    var note = status.textContent;
    function say(text, err) { status.textContent = text; status.classList.toggle('err', !!err); }
    function update() {
      var busy = items.some(function (it) { return !it.done; });
      send.disabled = busy || !items.length || !consent.checked;
      send.textContent = busy ? 'UPLOADING…' : 'SEND IT IN ›';
    }
    consent.addEventListener('change', update);
    input.addEventListener('change', function () {
      Array.prototype.forEach.call(input.files, function (file) {
        var type = typeOf(file);
        if (items.length >= MAX_FILES) return say('Up to ' + MAX_FILES + ' files at a time.', true);
        if (!TYPES.test(type)) return say(file.name + ': that file type isn’t supported.', true);
        if (file.size > MAX_BYTES) return say(file.name + ' is over 100 MB.', true);
        say(note);
        var it = { name: file.name, done: false }, el = document.createElement('div');
        el.className = 'fan-pv';
        if (/^image\/(jpeg|png|webp|gif)$/.test(type)) { el.innerHTML = '<img alt="">'; el.firstChild.src = URL.createObjectURL(file); }
        else if (/^video\//.test(type)) { el.innerHTML = '<video muted playsinline preload="metadata"></video>'; el.firstChild.src = URL.createObjectURL(file); }
        else el.innerHTML = '<span class="fan-fname">' + esc(file.name) + '</span>';
        el.insertAdjacentHTML('beforeend', '<span class="fan-size">' + mb(file.size) + '</span><button type="button" aria-label="Remove ' + esc(file.name) + '">✕</button><span class="fan-prog"></span>');
        el.querySelector('button').onclick = function () { it.removed = true; items.splice(items.indexOf(it), 1); el.remove(); update(); };
        prev.appendChild(el); items.push(it); update();
        var ext = ((file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin').toLowerCase();
        var name = 'fan-submissions-media/' + Math.random().toString(36).slice(2, 10) + '.' + ext;
        uploader().then(function (b) {
          return b.upload(name, file, {
            access: 'private', handleUploadUrl: '/api/community?upload=1', contentType: type,
            multipart: file.size > 20 * 1048576,
            onUploadProgress: function (p) { el.querySelector('.fan-prog').style.width = p.percentage + '%'; }
          });
        }).then(function (blob) {
          it.pathname = blob.pathname; it.done = true; el.classList.add('done'); update();
        }).catch(function (e) {
          if (!it.removed) { say(file.name + ': ' + (e.message || 'upload failed'), true); items.splice(items.indexOf(it), 1); el.remove(); update(); }
        });
      });
      input.value = '';
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (send.disabled) return;
      send.disabled = true; say('Sending…');
      post({
        action: 'submit', consent: consent.checked === true,
        handle: $('fanHandle').value, caption: $('fanCaption').value,
        files: items.map(function (it) { return { pathname: it.pathname, name: it.name }; })
      }).then(function () {
        form.hidden = true; $('fanDone').hidden = false;
      }).catch(function (e) { say(e.message, true); update(); });
    });
    $('fanAgain').addEventListener('click', function () {
      items = []; prev.innerHTML = ''; $('fanCaption').value = ''; consent.checked = false;
      say(note); update(); $('fanDone').hidden = true; form.hidden = false;
    });
  }

  // ---- The owner's inbox ----
  var box = $('fan-inbox');
  if (!box) return;
  fetch('/api/auth/session', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
    if (!s || !s.admin) return;
    box.hidden = false;
    load();
  }).catch(function () {});

  function fileHtml(f) {
    var media = f.kind === 'image' && !/heic|heif/.test(f.type) ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener"><img src="' + esc(f.url) + '" alt="' + esc(f.name) + '" loading="lazy"></a>'
      : f.kind === 'video' ? '<video src="' + esc(f.url) + '" controls playsinline preload="metadata"></video>'
      : f.kind === 'audio' ? '<audio src="' + esc(f.url) + '" controls preload="none"></audio>'
      : '<a class="fan-fname" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>';
    return '<div class="fan-file">' + media + '<a class="fan-dl" href="' + esc(f.download) + '" download>Save · ' + mb(f.size) + '</a></div>';
  }
  function cardHtml(s) {
    var when = new Date(s.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    var credit = s.handle ? '<a href="https://www.instagram.com/' + encodeURIComponent(s.handle) + '/" target="_blank" rel="noopener">@' + esc(s.handle) + '</a>' : '<span class="fan-muted">no credit asked</span>';
    return '<article class="fan-sub fan-' + esc(s.status) + '" data-id="' + esc(s.id) + '">' +
      '<div class="fan-head"><span class="fan-badge">' + (s.status === 'posted' ? 'Posted' : s.status === 'new' ? 'New' : 'Seen') + '</span>' +
      '<span>From <b>@' + esc(s.username) + '</b></span><span class="fan-muted">' + esc(when) + '</span></div>' +
      '<p class="fan-credit">Credit: ' + credit + '</p>' +
      (s.caption ? '<p class="fan-caption">' + esc(s.caption) + '</p>' : '') +
      '<div class="fan-files">' + (s.files || []).map(fileHtml).join('') + '</div>' +
      '<div class="fan-actions">' + (s.status !== 'posted' ? '<button type="button" data-mark="posted">Mark posted</button>' : '<button type="button" data-mark="seen">Not posted</button>') +
      '<button type="button" class="fan-del" data-del>Delete</button></div></article>';
  }
  function load() {
    var list = $('fanInboxList');
    list.innerHTML = '<p class="fan-muted">Loading…</p>';
    fetch('/api/community?view=submissions', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      var subs = d.submissions || [];
      var fresh = subs.filter(function (s) { return s.status === 'new'; });
      $('fanInboxCount').textContent = subs.length ? subs.length + ' total · ' + fresh.length + ' new' : '';
      list.innerHTML = subs.length ? subs.map(cardHtml).join('') : '<p class="fan-muted">Nothing yet. Uploads from the form above show up here.</p>';
      if (location.hash === '#fan-inbox') box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Opening the inbox marks new ones as seen (they keep their badge until reload).
      fresh.forEach(function (s) { post({ action: 'submissionMark', id: s.id, status: 'seen' }).catch(function () {}); });
    }).catch(function () { list.innerHTML = '<p class="fan-muted">Couldn’t load uploads. Refresh to try again.</p>'; });
  }
  box.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    var card = b.closest('.fan-sub'); if (!card) return;
    var id = card.getAttribute('data-id');
    if (b.hasAttribute('data-del')) {
      if (!confirm('Delete this upload and its files for good?')) return;
      b.disabled = true;
      post({ action: 'submissionDelete', id: id }).then(function () { card.remove(); }).catch(function (e) { alert(e.message); b.disabled = false; });
    } else if (b.hasAttribute('data-mark')) {
      b.disabled = true;
      post({ action: 'submissionMark', id: id, status: b.getAttribute('data-mark') }).then(load).catch(function (e) { alert(e.message); b.disabled = false; });
    }
  });
})();
