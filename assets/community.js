// Shared helpers for the Wall and member profiles.
window.JR = (function () {
  var THEMES = { silver: '200,205,214', red: '220,38,38', gold: '212,160,23', blue: '37,99,235', purple: '147,51,234', green: '22,163,74', pink: '219,39,119', orange: '234,88,12' };
  var PATTERNS = {
    stars: '<pattern id="pt" width="40" height="40" patternUnits="userSpaceOnUse"><text x="6" y="22" font-size="14" fill="#fff">★</text><text x="26" y="38" font-size="8" fill="#fff">★</text></pattern>',
    stripes: '<pattern id="pt" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="9" height="22" fill="#fff"/></pattern>',
    waves: '<pattern id="pt" width="60" height="20" patternUnits="userSpaceOnUse"><path d="M0 10 Q15 0 30 10 T60 10" stroke="#fff" stroke-width="2" fill="none"/></pattern>',
    grid: '<pattern id="pt" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" stroke="#fff" stroke-width="1" fill="none"/></pattern>',
    dots: '<pattern id="pt" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.2" fill="#fff"/></pattern>',
    flames: '<pattern id="pt" width="46" height="46" patternUnits="userSpaceOnUse"><text x="4" y="30" font-size="20">🔥</text></pattern>',
    palms: '<pattern id="pt" width="50" height="50" patternUnits="userSpaceOnUse"><text x="6" y="34" font-size="22">🌴</text></pattern>'
  };
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function rgb(theme) { return THEMES[theme] || THEMES.silver; }
  function avatar(u, cls) {
    var inner = u.avatar ? esc(u.avatar) : (u.picture && /^https:\/\//.test(u.picture) ? '<img src="' + esc(u.picture) + '" alt="">' : esc((u.name || u.username || '?').charAt(0).toUpperCase()));
    return '<a class="av ' + (cls || '') + '" style="--t:' + rgb(u.theme) + '" href="/u/' + encodeURIComponent(u.username) + '" aria-label="@' + esc(u.username) + '">' + inner + '</a>';
  }
  function ago(iso) {
    var s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'd';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function linkify(text) {
    return esc(text).replace(/(^|[^\w])@([a-z0-9_]{3,20})\b/g, function (m, pre, name) { return pre + '<a class="mention" href="/u/' + name + '">@' + name + '</a>'; });
  }
  function mediaHtml(list) {
    if (!list || !list.length) return '';
    var files = list.filter(function (m) { return m.kind === 'file'; });
    var vis = list.filter(function (m) { return m.kind !== 'file'; });
    var out = '';
    if (vis.length) {
      out += '<div class="media n' + vis.length + '">' + vis.map(function (m) {
        return m.kind === 'video'
          ? '<video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video>'
          : '<a href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="" loading="lazy"></a>';
      }).join('') + '</div>';
    }
    files.forEach(function (m) {
      out += '<a class="filecard" href="' + esc(m.url) + '" target="_blank" rel="noopener"><span style="font-size:26px">📄</span><span><b>' + esc(m.name || 'Document.pdf') + '</b><small>PDF · ' + Math.max(1, Math.round((m.size || 0) / 1024)) + ' KB</small></span></a>';
    });
    return out;
  }
  function postHtml(p, author, reactions, isAdmin) {
    var a = author || { username: p.author, name: p.author, theme: 'silver' };
    var r = reactions.map(function (e) {
      var x = p.reactions[e] || { count: 0 };
      return '<button class="react' + (x.mine ? ' on' : '') + '" data-id="' + p.id + '" data-emoji="' + e + '" type="button" aria-label="React ' + e + '">' + e + (x.count ? '<b>' + x.count + '</b>' : '') + '</button>';
    }).join('');
    var tools = '';
    if (!p.canDelete) tools += '<button type="button" data-report="' + p.id + '"' + (p.reported ? ' disabled>Reported' : '>Report') + '</button>';
    if (p.hidden && isAdmin) tools += '<button type="button" data-restore="' + p.id + '">Restore</button>';
    if (p.canDelete) tools += '<button type="button" data-del="' + p.id + '">Delete</button>';
    if (isAdmin && p.authorEmail) tools += '<button type="button" data-ban="' + esc(p.authorEmail) + '" data-user="' + esc(a.username) + '" data-id="' + p.id + '">Ban</button>';
    return '<article class="post" id="p-' + p.id + '" style="--t:' + rgb(a.theme) + (p.hidden ? ';opacity:.55' : '') + '">' + avatar(a) +
      '<div class="body"><div class="who"><a href="/u/' + encodeURIComponent(a.username) + '">' + esc(a.name) + '</a>' +
      (a.title && a.title !== 'Member' ? '<span class="badge">' + esc(a.title) + '</span>' : '') +
      '<span class="handle">@' + esc(a.username) + '</span><time datetime="' + esc(p.createdAt) + '">· ' + ago(p.createdAt) + '</time>' +
      (p.hidden ? '<span class="badge" style="background:#f59e0b">Hidden · ' + (p.reports || 0) + ' reports</span>' : '') + '</div>' +
      (p.text ? '<div class="text">' + linkify(p.text) + '</div>' : '') + mediaHtml(p.media) +
      '<div class="reacts">' + r + '<span class="tool">' + tools + '</span></div></div></article>';
  }
  function api(body) {
    return fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Something went wrong'); e.data = d; throw e; } return d; }); });
  }
  // Wire reactions, report, delete and owner actions on any container of posts.
  function wire(container, getAuthor, reactions, isAdmin) {
    var adminOn = function () { return typeof isAdmin === 'function' ? isAdmin() : !!isAdmin; };
    container.addEventListener('click', function (ev) {
      var b = ev.target.closest('.react');
      if (b) {
        b.disabled = true;
        api({ action: 'react', id: b.dataset.id, emoji: b.dataset.emoji }).then(function (d) {
          var el = document.getElementById('p-' + d.post.id);
          var tmp = document.createElement('div'); tmp.innerHTML = postHtml(d.post, getAuthor(d.post.author), reactions, adminOn());
          tmp.firstChild.style.animation = 'none'; el.replaceWith(tmp.firstChild);
        }).catch(function () { b.disabled = false; });
        return;
      }
      var t;
      if ((t = ev.target.closest('[data-del]')) && confirm('Delete this post?')) {
        api({ action: 'delete', id: t.dataset.del }).then(function () { var el = document.getElementById('p-' + t.dataset.del); if (el) el.remove(); });
      } else if ((t = ev.target.closest('[data-report]')) && confirm('Report this post to the site owner?')) {
        t.disabled = true;
        api({ action: 'report', id: t.dataset.report }).then(function () { t.textContent = 'Reported'; }).catch(function (e) { alert(e.message); t.disabled = false; });
      } else if ((t = ev.target.closest('[data-restore]'))) {
        api({ action: 'restore', id: t.dataset.restore }).then(function () { location.reload(); });
      } else if ((t = ev.target.closest('[data-ban]'))) {
        var reason = prompt('Ban @' + t.dataset.user + ' (' + t.dataset.ban + ')? Their account and all their posts will be deleted and they can never sign in again.\n\nOptional reason:', '');
        if (reason === null) return;
        fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ban', email: t.dataset.ban, reason: reason }) })
          .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error); return x; }); })
          .then(function () { container.querySelectorAll('.post').forEach(function (el) { var bb = el.querySelector('[data-ban]'); if (bb && bb.dataset.ban === t.dataset.ban) el.remove(); }); })
          .catch(function (e) { alert(e.message); });
      }
    });
  }
  function card(u) {
    var t = rgb(u.theme);
    var meta = '';
    if (u.location) meta += '<span class="chip">📍 ' + esc(u.location) + '</span>';
    (u.interests || []).forEach(function (i) { meta += '<span class="chip">' + esc(i) + '</span>'; });
    [['instagram', 'https://instagram.com/', 'IG'], ['x', 'https://x.com/', 'X'], ['tiktok', 'https://tiktok.com/@', 'TikTok']].forEach(function (s) {
      if (u[s[0]] && /^[A-Za-z0-9._]{1,30}$/.test(u[s[0]])) meta += '<a class="chip" target="_blank" rel="noopener noreferrer" href="' + s[1] + u[s[0]] + '">' + s[2] + ' @' + esc(u[s[0]]) + '</a>';
    });
    var since = new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    return '<div class="member ' + esc(u.finish) + '" style="--t:' + t + '">' +
      (PATTERNS[u.banner] ? '<svg class="banner" aria-hidden="true"><defs>' + PATTERNS[u.banner] + '</defs><rect width="100%" height="100%" fill="url(#pt)"/></svg>' : '') +
      avatar(u, 'big') +
      '<div><div class="m-name f-' + esc(u.font) + ' e-' + esc(u.effect) + '">' + esc(u.name) + '</div>' +
      '<div class="m-handle">@' + esc(u.username) + (u.pronouns ? ' · ' + esc(u.pronouns) : '') + ' · member since ' + since + '</div>' +
      '<span class="badge m-title">' + esc(u.title) + '</span>' + (u.mood ? '<div class="m-mood">' + esc(u.mood) + '</div>' : '') + '</div>' +
      '<p class="m-bio">' + esc(u.bio) + '</p><p class="m-quote">' + (u.quote ? '“' + esc(u.quote) + '”' : '') + '</p><div class="m-meta">' + meta + '</div></div>';
  }
  return { esc: esc, rgb: rgb, avatar: avatar, postHtml: postHtml, mediaHtml: mediaHtml, api: api, wire: wire, card: card };
})();
