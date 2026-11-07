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
  function postHtml(p, author, reactions) {
    var a = author || { username: p.author, name: p.author, theme: 'silver' };
    var r = reactions.map(function (e) {
      var x = p.reactions[e] || { count: 0 };
      return '<button class="react' + (x.mine ? ' on' : '') + '" data-id="' + p.id + '" data-emoji="' + e + '" type="button">' + e + (x.count ? '<b>' + x.count + '</b>' : '') + '</button>';
    }).join('');
    return '<article class="post" id="p-' + p.id + '" style="--t:' + rgb(a.theme) + '">' + avatar(a) +
      '<div class="body"><div class="who"><a href="/u/' + encodeURIComponent(a.username) + '">' + esc(a.name) + '</a><span class="handle">@' + esc(a.username) + '</span>' +
      (a.title && a.title !== 'Member' ? '<span class="badge">' + esc(a.title) + '</span>' : '') + '<time datetime="' + esc(p.createdAt) + '">· ' + ago(p.createdAt) + '</time></div>' +
      '<div class="text">' + linkify(p.text) + '</div><div class="reacts">' + r +
      (p.canDelete ? '<button class="del" data-del="' + p.id + '" type="button">Delete</button>' : '') + '</div></div></article>';
  }
  function api(body) {
    return fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d; }); });
  }
  // Wire reactions + delete on any container of posts.
  function wire(container, getAuthor, reactions) {
    container.addEventListener('click', function (ev) {
      var b = ev.target.closest('.react');
      if (b) {
        b.disabled = true;
        api({ action: 'react', id: b.dataset.id, emoji: b.dataset.emoji }).then(function (d) {
          var el = document.getElementById('p-' + d.post.id);
          var tmp = document.createElement('div'); tmp.innerHTML = postHtml(d.post, getAuthor(d.post.author), reactions);
          tmp.firstChild.style.animation = 'none'; el.replaceWith(tmp.firstChild);
        }).catch(function () { b.disabled = false; });
        return;
      }
      var del = ev.target.closest('[data-del]');
      if (del && confirm('Delete this post?')) {
        api({ action: 'delete', id: del.dataset.del }).then(function () { var el = document.getElementById('p-' + del.dataset.del); if (el) el.remove(); });
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
  return { esc: esc, rgb: rgb, avatar: avatar, postHtml: postHtml, api: api, wire: wire, card: card };
})();
