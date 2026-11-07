// JAVISREVENGE community app: The Wall, single posts, notifications, saved
// posts and member profiles. Served at /wall and /u/<username>.
(function () {
  'use strict';
  var THEMES = { silver: '120,130,145', red: '220,38,38', gold: '202,138,4', blue: '37,99,235', purple: '147,51,234', green: '22,163,74', pink: '219,39,119', orange: '234,88,12' };
  var PATTERNS = {
    stars: '<pattern id="pt" width="40" height="40" patternUnits="userSpaceOnUse"><text x="6" y="22" font-size="14" fill="#fff">★</text><text x="26" y="38" font-size="8" fill="#fff">★</text></pattern>',
    stripes: '<pattern id="pt" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="9" height="22" fill="#fff"/></pattern>',
    waves: '<pattern id="pt" width="60" height="20" patternUnits="userSpaceOnUse"><path d="M0 10 Q15 0 30 10 T60 10" stroke="#fff" stroke-width="2" fill="none"/></pattern>',
    grid: '<pattern id="pt" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" stroke="#fff" stroke-width="1" fill="none"/></pattern>',
    dots: '<pattern id="pt" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.2" fill="#fff"/></pattern>',
    flames: '<pattern id="pt" width="46" height="46" patternUnits="userSpaceOnUse"><text x="4" y="30" font-size="20">🔥</text></pattern>',
    palms: '<pattern id="pt" width="50" height="50" patternUnits="userSpaceOnUse"><text x="6" y="34" font-size="22">🌴</text></pattern>'
  };
  var I = {
    reply: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.6-4.6A8 8 0 1 1 21 12z"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    clip: '<svg viewBox="0 0 24 24"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/></svg>',
    poll: '<svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    brush: '<svg viewBox="0 0 24 24"><path d="M18 3l3 3-9 9-3-3zM9 12l-3 3c-2 0-3 1.5-3 4 2.5 0 4-1 4-3l3-3"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>',
    sword: '<svg viewBox="0 0 24 24"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/></svg>'
  };
  var REACTIONS = ['🔥', '🇺🇸', '😂', '💯', '👏', '😤'];
  var state = { me: null, admin: false, mediaEnabled: false, authors: {}, posts: {}, unread: 0 };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function rgb(t) { return THEMES[t] || THEMES.silver; }
  function author(n) { return state.authors[n] || { username: n, name: n, theme: 'silver' }; }
  function ago(iso) {
    var s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 45) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'd';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fullDate(iso) { return new Date(iso).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' }); }
  function avatar(u, cls, link) {
    var t = rgb(u.theme), inner, extra = '';
    if (u.avatar) { inner = esc(u.avatar); extra = ' emoji'; }
    else if (u.picture && /^https:\/\//.test(u.picture)) inner = '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">';
    else inner = esc((u.name || u.username || '?').charAt(0).toUpperCase());
    var tag = link === false ? 'span' : 'a';
    var href = link === false ? '' : ' href="/u/' + encodeURIComponent(u.username) + '" data-nav';
    return '<' + tag + ' class="av' + extra + ' ' + (cls || '') + '" style="--t:' + t + '"' + href + ' aria-label="@' + esc(u.username) + '">' + inner + '</' + tag + '>';
  }
  function linkify(text) {
    return esc(text)
      .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + (u.length > 48 ? u.slice(0, 45) + '…' : u) + '</a>'; })
      .replace(/(^|[^\w&])@([a-z0-9_]{3,20})\b/g, function (m, pre, n) { return pre + '<a href="/u/' + n + '" data-nav>@' + n + '</a>'; })
      .replace(/(^|\s)#([a-zA-Z0-9_]{2,30})\b/g, function (m, pre, t) { return pre + '<a href="/wall?tag=' + t.toLowerCase() + '" data-nav>#' + t + '</a>'; });
  }
  function api(body) {
    return fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Something went wrong'); e.data = d; throw e; } return d; }); });
  }
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (r.status === 401 || r.status === 403) { location.replace('/signin?returnTo=' + encodeURIComponent(location.pathname + location.search)); throw new Error('auth'); }
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Not found'); return d; });
    });
  }
  function toast(msg, err) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  // ---------- rendering ----------
  function mediaHtml(list) {
    if (!list || !list.length) return '';
    var files = list.filter(function (m) { return m.kind === 'file'; });
    var vis = list.filter(function (m) { return m.kind !== 'file'; });
    var out = '';
    if (vis.length) out += '<div class="media n' + vis.length + '">' + vis.map(function (m) {
      return m.kind === 'video'
        ? '<video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video>'
        : '<a href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="" loading="lazy"></a>';
    }).join('') + '</div>';
    files.forEach(function (m) {
      out += '<a class="filecard" href="' + esc(m.url) + '" target="_blank" rel="noopener"><span class="ic">PDF</span><span style="min-width:0"><b>' + esc(m.name || 'Document.pdf') + '</b><small>' + Math.max(1, Math.round((m.size || 0) / 1024)) + ' KB · tap to open</small></span></a>';
    });
    return out;
  }
  function pollHtml(p) {
    if (!p.poll) return '';
    var voted = p.poll.mine >= 0, total = p.poll.total;
    return '<div class="poll">' + p.poll.options.map(function (o, i) {
      var pct = total ? Math.round(o.count * 100 / total) : 0;
      return voted
        ? '<button class="opt res' + (p.poll.mine === i ? ' mine' : '') + '" data-vote="' + i + '" data-id="' + p.id + '"><span class="fill" style="width:' + pct + '%"></span><span>' + esc(o.text) + '</span><span>' + pct + '%</span></button>'
        : '<button class="opt" data-vote="' + i + '" data-id="' + p.id + '"><span>' + esc(o.text) + '</span></button>';
    }).join('') + '<div class="meta">' + total + ' vote' + (total === 1 ? '' : 's') + (voted ? ' · tap another option to change' : ' · votes are anonymous') + '</div></div>';
  }
  function reactsHtml(p) {
    var a = author(p.author), shown = REACTIONS.filter(function (e) { return p.reactions[e] && p.reactions[e].count; });
    return '<span class="reactbox" style="--t:' + rgb(a.theme) + '">' + shown.map(function (e) {
      var x = p.reactions[e];
      return '<button class="react' + (x.mine ? ' on' : '') + '" data-react="' + e + '" data-id="' + p.id + '" aria-label="' + e + ' ' + x.count + '">' + e + '<b>' + x.count + '</b></button>';
    }).join('') + '<button class="react add" data-picker="' + p.id + '" aria-label="Add reaction">' + I.smile.replace('<svg', '<svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9"') + '</button></span>';
  }
  function postHtml(p, solo) {
    state.posts[p.id] = p;
    var a = author(p.author);
    return '<article class="post' + (solo ? ' solo' : '') + (p.hidden ? ' hiddenpost' : '') + '" id="p-' + p.id + '" data-open="' + p.id + '" style="--t:' + rgb(a.theme) + '">' +
      avatar(a) +
      '<div class="body">' +
        (p.pinned ? '<div class="pinline">📌 Pinned by the owner</div>' : '') +
        '<div class="who"><a class="nm" href="/u/' + encodeURIComponent(a.username) + '" data-nav>' + esc(a.name) + '</a>' +
          (a.title && a.title !== 'Member' ? '<span class="badge">' + esc(a.title) + '</span>' : '') +
          '<span class="hd">@' + esc(a.username) + '</span><span class="hd">·</span><time datetime="' + esc(p.createdAt) + '" title="' + esc(fullDate(p.createdAt)) + '">' + ago(p.createdAt) + '</time>' +
          (p.hidden ? '<span class="badge warn">Hidden' + (p.reports ? ' · ' + p.reports + ' reports' : '') + '</span>' : '') +
        '</div>' +
        (p.text ? '<div class="text">' + linkify(p.text) + '</div>' : '') + mediaHtml(p.media) + pollHtml(p) +
        (solo ? '<div class="muted" style="margin-top:12px;padding-bottom:10px;border-bottom:1px solid var(--line)">' + esc(fullDate(p.createdAt)) + '</div>' : '') +
        '<div class="actions">' +
          '<button class="act reply" data-reply="' + p.id + '" aria-label="Reply">' + I.reply + '<span>' + (p.replyCount || '') + '</span></button>' +
          reactsHtml(p) +
          '<button class="act save' + (p.saved ? ' on' : '') + '" data-save="' + p.id + '" aria-label="Save">' + I.save + '</button>' +
          '<button class="act share" data-share="' + p.id + '" aria-label="Copy link">' + I.share + '</button>' +
        '</div>' +
      '</div>' +
      '<button class="more" data-more="' + p.id + '" aria-label="More">⋯</button>' +
    '</article>';
  }
  function menuHtml(p) {
    var mine = p.author === state.me.username, out = '';
    out += '<button data-share="' + p.id + '">🔗 Copy link to post</button>';
    out += '<button data-save="' + p.id + '">' + (p.saved ? '🔖 Remove from Saved' : '🔖 Save post') + '</button>';
    if (!mine) out += '<button data-report="' + p.id + '"' + (p.reported ? ' disabled' : '') + '>🚩 ' + (p.reported ? 'Reported' : 'Report post') + '</button>';
    if (mine && !state.admin) out += '<button class="red" data-del="' + p.id + '">🗑️ Delete</button>';
    if (state.admin) {
      out += '<div class="owner">';
      out += '<button data-pin="' + p.id + '">📌 ' + (p.pinned ? 'Unpin' : 'Pin to top of the Wall') + '</button>';
      if (p.hidden) out += '<button data-restore="' + p.id + '">♻️ Restore post</button>';
      out += '<button class="red" data-del="' + p.id + '">🗑️ Delete post</button>';
      if (!mine && p.authorEmail) out += '<button class="red" data-ban="' + esc(p.authorEmail) + '" data-user="' + esc(p.author) + '">⛔ Ban @' + esc(p.author) + '</button>';
      if (p.authorEmail && !mine) out += '<button disabled style="font-weight:500;color:var(--ink2);font-size:13px">' + esc(p.authorEmail) + '</button>';
      out += '</div>';
    }
    return '<div class="menu" role="menu">' + out + '</div>';
  }
  function replyHtml(r, postId) {
    var a = author(r.author);
    return '<div class="reply" id="r-' + r.id + '" style="--t:' + rgb(a.theme) + '">' + avatar(a, 'sm') +
      '<div class="body"><div class="who"><a class="nm" href="/u/' + encodeURIComponent(a.username) + '" data-nav>' + esc(a.name) + '</a><span class="hd">@' + esc(a.username) + ' · ' + ago(r.createdAt) + '</span>' +
      (r.canDelete ? '<button class="del" data-delreply="' + r.id + '" data-id="' + postId + '">Delete</button>' : '') + '</div>' +
      '<div class="text">' + linkify(r.text) + '</div>' +
      (state.admin && r.authorEmail && r.author !== state.me.username ? '<div class="muted" style="font-size:12px;margin-top:4px">Owner only: ' + esc(r.authorEmail) + ' · <a href="#" data-ban="' + esc(r.authorEmail) + '" data-user="' + esc(r.author) + '" style="color:var(--red)">Ban</a></div>' : '') +
      '</div></div>';
  }

  // ---------- views ----------
  var main, route = {};
  function setTop(title, sub, back, tabs) {
    $('topTitle').textContent = title; $('topSub').textContent = sub || '';
    $('backBtn').hidden = !back;
    $('tabs').hidden = !tabs;
    document.title = title + ' · JAVISREVENGE';
  }
  function setNav(which) {
    document.querySelectorAll('[data-navkey]').forEach(function (el) { el.classList.toggle('on', el.dataset.navkey === which); });
  }
  function loading() { main.innerHTML = '<p class="empty">Loading…</p>'; }

  function showFeed() {
    var tab = route.tab || 'latest';
    setTop(route.tag ? '#' + route.tag : route.q ? 'Search' : tab === 'saved' ? 'Saved' : 'The Wall', route.q ? '“' + route.q + '”' : tab === 'saved' ? 'Only you can see what you save' : 'Members only', !!(route.tag || route.q), !(route.tag || route.q) && tab !== 'saved');
    setNav(tab === 'saved' ? 'saved' : route.q ? 'search' : 'wall');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === tab); });
    $('composer').hidden = tab === 'saved' || !!route.q;
    loading();
    var qs = '?view=wall&tab=' + encodeURIComponent(tab) + (route.tag ? '&tag=' + encodeURIComponent(route.tag) : '') + (route.q ? '&q=' + encodeURIComponent(route.q) : '');
    getJSON('/api/community' + qs).then(function (d) {
      boot(d);
      renderTrending(d.trending);
      var empty = tab === 'saved' ? '<b>Nothing saved yet</b>Tap the bookmark on any post to keep it here.'
        : route.q ? '<b>No results</b>Try a different word or @username.'
        : route.tag ? '<b>No posts with #' + esc(route.tag) + '</b>Be the first to use it.'
        : tab === 'media' ? '<b>No photos or videos yet</b>' : tab === 'top' ? '<b>Nothing trending this week</b>React to posts to push them up.'
        : '<b>Welcome to the Wall</b>Nobody has posted yet. Be the first. 🔥';
      main.innerHTML = d.posts.length ? d.posts.map(function (p) { return postHtml(p); }).join('') : '<div class="empty">' + empty + '</div>';
    }).catch(function (e) { if (e.message !== 'auth') main.innerHTML = '<div class="empty"><b>Could not load</b>' + esc(e.message) + '</div>'; });
  }

  function showPost(id) {
    setTop('Post', '', true, false); setNav('wall'); $('composer').hidden = true; loading();
    getJSON('/api/community?view=post&id=' + encodeURIComponent(id)).then(function (d) {
      boot(d);
      main.innerHTML = postHtml(d.post, true) +
        '<div class="replybox">' + avatar(state.me, 'sm', false) + '<textarea id="replyText" maxlength="300" placeholder="Post your reply" rows="1"></textarea><button class="send" id="replySend" disabled>Reply</button></div>' +
        '<div class="replies" id="replies">' + (d.replies.length ? d.replies.map(function (r) { return replyHtml(r, d.post.id); }).join('') : '<p class="empty" style="padding:28px">No replies yet. Start the conversation.</p>') + '</div>';
      var ta = $('replyText'), btn = $('replySend');
      ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; btn.disabled = !ta.value.trim(); });
      if (route.focus) ta.focus();
      btn.onclick = function () {
        btn.disabled = true;
        api({ action: 'reply', id: d.post.id, text: ta.value }).then(function (x) {
          state.authors[x.author.username] = x.author;
          var box = $('replies'); var e = box.querySelector('.empty'); if (e) e.remove();
          box.insertAdjacentHTML('beforeend', replyHtml(x.reply, d.post.id));
          ta.value = ''; ta.style.height = '';
          var c = document.querySelector('#p-' + d.post.id + ' .act.reply span'); if (c) c.textContent = x.replyCount;
        }).catch(function (e) { toast(e.message, true); if (e.data && e.data.banned) setTimeout(function () { location.replace('/signin?error=banned'); }, 2500); btn.disabled = false; });
      };
    }).catch(function (e) { if (e.message !== 'auth') main.innerHTML = '<div class="empty"><b>This post doesn\'t exist</b>It may have been deleted.</div>'; });
  }

  function showNotifications() {
    setTop('Notifications', 'Replies, mentions and reactions', false, false); setNav('notes'); $('composer').hidden = true; loading();
    getJSON('/api/community?view=notifications').then(function (d) {
      Object.keys(d.authors).forEach(function (k) { state.authors[k] = d.authors[k]; });
      var ICON = { reply: '💬', mention: '📣', react: '' };
      main.innerHTML = d.notifications.length ? d.notifications.map(function (n) {
        var a = n.from ? author(n.from) : null, line;
        if (n.type === 'react') line = '<b>' + (n.count > 1 ? n.count + ' people' : 'Someone') + '</b> reacted ' + esc(n.emoji) + ' to your post';
        else if (n.type === 'reply') line = '<b>' + esc(a.name) + '</b> replied to your post';
        else line = '<b>' + esc(a.name) + '</b> mentioned you';
        return '<a class="note' + (n.read ? '' : ' unread') + '" href="/wall?post=' + n.postId + '" data-nav><span class="ico">' + (ICON[n.type] || esc(n.emoji)) + '</span><span class="body">' +
          (a ? avatar(a, 'sm', false) : '') + '<div style="margin-top:6px">' + line + ' <time>· ' + ago(n.at) + '</time></div>' + (n.text ? '<p>' + esc(n.text) + '</p>' : '') + '</span></a>';
      }).join('') : '<div class="empty"><b>Nothing yet</b>When people reply to you, mention you or react to your posts, it shows up here.</div>';
      if (d.notifications.some(function (n) { return !n.read; })) api({ action: 'readNotifications' }).then(function () { setUnread(0); });
    }).catch(function () {});
  }

  function showProfile(name) {
    setTop('@' + name, '', true, false); setNav(state.me && name === state.me.username ? 'profile' : ''); $('composer').hidden = true; loading();
    getJSON('/api/community?view=profile&u=' + encodeURIComponent(name)).then(function (d) {
      var u = d.profile, t = rgb(u.theme);
      state.authors[u.username] = u; state.admin = d.admin;
      setTop(u.name, d.stats.posts + ' post' + (d.stats.posts === 1 ? '' : 's'), true, false);
      var facts = '';
      if (u.location) facts += '<span>📍 ' + esc(u.location) + '</span>';
      [['instagram', 'https://instagram.com/', 'Instagram'], ['x', 'https://x.com/', 'X'], ['tiktok', 'https://tiktok.com/@', 'TikTok']].forEach(function (s) {
        if (u[s[0]] && /^[A-Za-z0-9._]{1,30}$/.test(u[s[0]])) facts += '<a target="_blank" rel="noopener noreferrer" href="' + s[1] + u[s[0]] + '">' + s[2] + ' @' + esc(u[s[0]]) + '</a>';
      });
      facts += '<span>🗓️ Joined ' + new Date(u.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '</span>';
      var html = '<div class="cover ' + esc(u.finish) + '" style="--t:' + t + '">' + (PATTERNS[u.banner] ? '<svg aria-hidden="true"><defs>' + PATTERNS[u.banner] + '</defs><rect width="100%" height="100%" fill="url(#pt)"/></svg>' : '') + '</div>' +
        '<div class="phead" style="--t:' + t + '">' + avatar(u, 'lg', false) +
        (d.me === u.username ? '<a class="edit" href="/account">Edit profile</a>' : '') +
        '<div class="pname f-' + esc(u.font) + ' e-' + esc(u.effect) + '">' + esc(u.name) + '</div>' +
        '<div class="phandle">@' + esc(u.username) + (u.pronouns ? ' · ' + esc(u.pronouns) : '') + '</div>' +
        '<div style="margin-top:8px"><span class="badge">' + esc(u.title) + '</span>' + (u.mood ? ' <span class="muted" style="font-size:14px">' + esc(u.mood) + '</span>' : '') + '</div>' +
        (u.bio ? '<p class="pbio">' + linkify(u.bio) + '</p>' : '') + (u.quote ? '<p class="pquote">“' + esc(u.quote) + '”</p>' : '') +
        '<div class="pfacts">' + facts + '</div>' +
        ((u.interests || []).length ? '<div class="pchips">' + u.interests.map(function (i) { return '<span class="chip">' + esc(i) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="pstats"><span><b>' + d.stats.posts + '</b> posts</span><span><b>' + d.stats.reactions + '</b> reactions &amp; replies</span></div></div>';
      if (d.admin && d.email && d.me !== u.username) {
        html += '<div class="ownerpanel"><div class="lbl">OWNER ONLY · NOBODY ELSE SEES THIS</div><div style="margin-top:4px">Email: <b>' + esc(d.email) + '</b>' + (d.strikes ? ' · ⚠️ ' + d.strikes + '/3 strikes' : '') + '</div>' +
          '<div class="row"><button class="btn" data-remove="' + esc(d.email) + '" data-user="' + esc(u.username) + '">Remove account</button><input id="banReason" placeholder="Ban reason (optional)" maxlength="200"><button class="btn red" data-ban="' + esc(d.email) + '" data-user="' + esc(u.username) + '" data-reason-from="banReason">Ban</button></div></div>';
      }
      html += '<div class="tabs" style="border-bottom:1px solid var(--line)"><button class="tab on">Posts</button></div>';
      html += d.posts.length ? d.posts.map(function (p) { return postHtml(p); }).join('') : '<div class="empty"><b>No posts yet</b></div>';
      main.innerHTML = html;
      document.title = u.name + ' (@' + u.username + ') · JAVISREVENGE';
    }).catch(function (e) { if (e.message !== 'auth') main.innerHTML = '<div class="empty"><b>This account doesn\'t exist</b>Try searching for another.</div>'; });
  }

  // ---------- shell ----------
  function boot(d) {
    if (d.me) { state.me = d.me; state.authors[d.me.username] = d.me; }
    if ('admin' in d) state.admin = d.admin;
    if ('mediaEnabled' in d) state.mediaEnabled = d.mediaEnabled;
    if (d.authors) Object.keys(d.authors).forEach(function (k) { state.authors[k] = d.authors[k]; });
    if ('unread' in d) setUnread(d.unread);
    if (state.me && !boot.done) {
      boot.done = true;
      $('meAv').innerHTML = avatar(state.me, '', false);
      $('sideMe').innerHTML = avatar(state.me, 'sm', false) + '<span class="txt"><b>' + esc(state.me.name) + '</b><span>@' + esc(state.me.username) + '</span></span>';
      $('sideMe').href = $('navProfile').href = $('mobProfile').href = '/u/' + encodeURIComponent(state.me.username);
      if (state.admin) {
        $('navProfile').insertAdjacentHTML('afterend', '<a class="nav" href="/admin">' + I.shield + '<span>Admin</span></a>');
        loadOwnerBox();
      }
      if (!state.mediaEnabled) ['btnMedia', 'btnFile'].forEach(function (id) { $(id).disabled = true; $(id).title = 'Uploads switch on once automatic moderation is set up'; });
    }
  }
  function setUnread(n) {
    state.unread = n;
    document.querySelectorAll('.unread-dot').forEach(function (el) { el.textContent = n > 9 ? '9+' : n; el.hidden = !n; });
  }
  function renderTrending(list) {
    $('trending').innerHTML = list && list.length ? list.map(function (t, i) {
      return '<a class="item" href="/wall?tag=' + esc(t.tag) + '" data-nav><small>' + (i + 1) + ' · Trending on the Wall</small><b>#' + esc(t.tag) + '</b><small>' + t.count + ' post' + (t.count === 1 ? '' : 's') + '</small></a>';
    }).join('') : '<div class="pad muted">No hashtags yet this week. Add one like #LA to a post.</div>';
  }
  function loadOwnerBox() {
    getJSON('/api/community?view=members').then(function (d) {
      $('ownerBox').hidden = false;
      $('ownerMembers').innerHTML = d.members.slice(0, 5).map(function (m) {
        return '<a class="who-row" href="/u/' + encodeURIComponent(m.username) + '" data-nav>' + avatar(m, 'sm', false) + '<span><b>' + esc(m.name) + '</b><span>@' + esc(m.username) + '</span></span></a>';
      }).join('') + '<div class="pad muted" style="padding-top:8px">' + d.total + ' members total · <a href="/admin">Manage</a></div>';
    }).catch(function () {});
  }

  // ---------- routing ----------
  function parse() {
    var p = new URLSearchParams(location.search), m = location.pathname.match(/^\/u\/([^/]+)/);
    route = { tab: p.get('tab') || 'latest', tag: (p.get('tag') || '').replace(/[^a-z0-9_]/gi, '').toLowerCase(), q: (p.get('q') || '').slice(0, 60), post: p.get('post'), view: p.get('view'), focus: p.get('reply') === '1', user: m ? decodeURIComponent(m[1]).toLowerCase() : null };
  }
  function render() {
    parse(); closeMenus(); window.scrollTo(0, 0);
    if (route.user) return showProfile(route.user);
    if (route.post) return showPost(route.post);
    if (route.view === 'notifications') return showNotifications();
    showFeed();
  }
  function go(url) { history.pushState(null, '', url); render(); }
  window.addEventListener('popstate', render);

  // ---------- interactions ----------
  function closeMenus() { document.querySelectorAll('.menu, .picker').forEach(function (m) { m.remove(); }); }
  function replacePost(p) {
    var el = $('p-' + p.id); if (!el) return;
    var tmp = document.createElement('div'); tmp.innerHTML = postHtml(p, el.classList.contains('solo')); el.replaceWith(tmp.firstChild);
  }
  function removePost(id) { var el = $('p-' + id); if (el) el.remove(); if (route.post === id) go('/wall'); }
  function ownerAct(kind, email, user, reason) {
    return fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind, email: email, reason: reason || '' }) })
      .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error); return x; }); })
      .then(function (x) {
        toast((kind === 'ban' ? 'Banned @' : 'Removed @') + user + ' · ' + x.postsDeleted + ' post(s) deleted');
        document.querySelectorAll('.post').forEach(function (el) { var p = state.posts[el.id.slice(2)]; if (p && p.author === user) el.remove(); });
        if (route.user === user) go('/wall');
      }).catch(function (e) { toast(e.message, true); });
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target, el;
    if ((el = t.closest('[data-nav]')) && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault(); ev.stopPropagation(); go(el.getAttribute('href')); return;
    }
    if ((el = t.closest('[data-more]'))) {
      ev.stopPropagation(); var open = el.parentNode.querySelector('.menu'); closeMenus();
      if (!open) el.insertAdjacentHTML('afterend', menuHtml(state.posts[el.dataset.more]));
      return;
    }
    if ((el = t.closest('[data-picker]'))) {
      ev.stopPropagation(); var had = el.parentNode.querySelector('.picker'); closeMenus();
      if (!had) el.insertAdjacentHTML('afterend', '<div class="picker">' + REACTIONS.map(function (e) { return '<button data-react="' + e + '" data-id="' + el.dataset.picker + '">' + e + '</button>'; }).join('') + '</div>');
      return;
    }
    if ((el = t.closest('[data-react]'))) {
      ev.stopPropagation(); closeMenus();
      api({ action: 'react', id: el.dataset.id, emoji: el.dataset.react }).then(function (d) { replacePost(d.post); }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-vote]'))) {
      ev.stopPropagation();
      api({ action: 'vote', id: el.dataset.id, option: Number(el.dataset.vote) }).then(function (d) { replacePost(d.post); }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-save]'))) {
      ev.stopPropagation(); closeMenus(); var id = el.dataset.save;
      api({ action: 'save', id: id }).then(function (d) {
        var p = state.posts[id]; if (p) { p.saved = d.saved; replacePost(p); }
        toast(d.saved ? 'Saved — find it under Saved' : 'Removed from Saved');
        if (!d.saved && route.tab === 'saved' && !route.post) removePost(id);
      }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-share]'))) {
      ev.stopPropagation(); closeMenus();
      var url = location.origin + '/wall?post=' + el.dataset.share;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied — only members can open it'); }, function () { prompt('Copy this link:', url); });
      return;
    }
    if ((el = t.closest('[data-reply]'))) { ev.stopPropagation(); go('/wall?post=' + el.dataset.reply + '&reply=1'); return; }
    if ((el = t.closest('[data-report]'))) {
      ev.stopPropagation(); closeMenus();
      if (!confirm('Report this post to the site owner?')) return;
      api({ action: 'report', id: el.dataset.report }).then(function () { var p = state.posts[el.dataset.report]; if (p) p.reported = true; toast('Thanks — the owner will take a look'); }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-del]'))) {
      ev.stopPropagation(); closeMenus();
      if (!confirm('Delete this post? This can\'t be undone.')) return;
      api({ action: 'delete', id: el.dataset.del }).then(function () { removePost(el.dataset.del); toast('Post deleted'); }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-delreply]'))) {
      ev.stopPropagation();
      if (!confirm('Delete this reply?')) return;
      api({ action: 'deleteReply', id: el.dataset.id, rid: el.dataset.delreply }).then(function (d) {
        var r = $('r-' + el.dataset.delreply); if (r) r.remove();
        var c = document.querySelector('#p-' + el.dataset.id + ' .act.reply span'); if (c) c.textContent = d.replyCount || '';
      }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-pin]'))) {
      ev.stopPropagation(); closeMenus();
      api({ action: 'pin', id: el.dataset.pin }).then(function (d) { toast(d.pinned ? 'Pinned to the top of the Wall' : 'Unpinned'); render(); }).catch(function (e) { toast(e.message, true); });
      return;
    }
    if ((el = t.closest('[data-restore]'))) {
      ev.stopPropagation(); closeMenus();
      api({ action: 'restore', id: el.dataset.restore }).then(function () { toast('Post restored'); render(); });
      return;
    }
    if ((el = t.closest('[data-ban]'))) {
      ev.preventDefault(); ev.stopPropagation(); closeMenus();
      var reason = el.dataset.reasonFrom ? $(el.dataset.reasonFrom).value : prompt('Ban @' + el.dataset.user + ' (' + el.dataset.ban + ')?\n\nTheir account and every post is deleted, and that email can never sign in again.\n\nOptional reason:', '');
      if (reason === null) return;
      if (el.dataset.reasonFrom && !confirm('Ban @' + el.dataset.user + ' (' + el.dataset.ban + ')? This deletes their account and posts.')) return;
      ownerAct('ban', el.dataset.ban, el.dataset.user, reason);
      return;
    }
    if ((el = t.closest('[data-remove]'))) {
      if (!confirm('Remove @' + el.dataset.user + '? Their account and posts are deleted, but they can sign up again.')) return;
      ownerAct('remove', el.dataset.remove, el.dataset.user);
      return;
    }
    if ((el = t.closest('.tab[data-tab]'))) { go(el.dataset.tab === 'latest' ? '/wall' : '/wall?tab=' + el.dataset.tab); return; }
    // Clicking the body of a post opens it (but not on links, media or buttons).
    if ((el = t.closest('[data-open]')) && !t.closest('a, button, video, .menu, .picker, input, textarea') && !el.classList.contains('solo') && !window.getSelection().toString()) {
      go('/wall?post=' + el.dataset.open); return;
    }
    if (!t.closest('.menu, .picker')) closeMenus();
  });

  // ---------- composer ----------
  var items = [], pollOn = false;
  var LIMITS = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024, file: 20 * 1024 * 1024 };
  function refreshSend() {
    var text = $('text'), n = text.value.length, left = 500 - n, ring = $('ring');
    var C = 2 * Math.PI * 10; ring.querySelector('.fg').style.strokeDashoffset = C * (1 - Math.min(n, 500) / 500);
    ring.setAttribute('class', 'ring' + (left < 0 ? ' over' : left < 40 ? ' warn' : '')); ring.style.visibility = n ? 'visible' : 'hidden';
    $('leftN').textContent = left < 40 ? left : '';
    var busy = items.some(function (i) { return !i.done; });
    var pollOk = !pollOn || Array.prototype.filter.call(document.querySelectorAll('#pollEdit input'), function (i) { return i.value.trim(); }).length >= 2;
    $('send').disabled = busy || !pollOk || (!text.value.trim() && !items.length);
  }
  function say(msg, err) { var s = $('status'); s.className = 'cstatus' + (err ? ' err' : ''); s.textContent = msg || ''; }
  function kindOf(f) { return /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : f.type === 'application/pdf' ? 'file' : null; }
  function shrinkImage(file) {
    if (file.type === 'image/gif') return Promise.resolve(file);
    return createImageBitmap(file).then(function (bm) {
      var scale = Math.min(1, 2048 / Math.max(bm.width, bm.height));
      var c = document.createElement('canvas'); c.width = Math.round(bm.width * scale); c.height = Math.round(bm.height * scale);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.86); });
    }).catch(function () { return file; });
  }
  function videoFrames(file) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
      var url = URL.createObjectURL(file); v.src = url;
      var frames = [], points = [0.05, 0.3, 0.55, 0.8, 0.97], i = 0;
      v.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that video')); };
      v.onloadedmetadata = next;
      function next() { if (i >= points.length) { URL.revokeObjectURL(url); return resolve(frames); } v.currentTime = Math.max(0, (v.duration || 1) * points[i++]); }
      v.onseeked = function () {
        var w = 480, h = Math.round(w * (v.videoHeight / v.videoWidth || 0.5625));
        var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
        frames.push(c.toDataURL('image/jpeg', 0.7)); next();
      };
    });
  }
  var blobLib;
  function uploader() { return blobLib || (blobLib = import('https://esm.sh/@vercel/blob@2.8.0/client')); }
  function addFiles(list) {
    say('');
    if (pollOn) return say('Remove the poll to add attachments.', true);
    Array.prototype.forEach.call(list, function (file) {
      if (items.length >= 4) return say('Up to 4 attachments per post.', true);
      var kind = kindOf(file);
      if (!kind) return say(file.name + ': only photos, videos and PDFs.', true);
      if (file.size > LIMITS[kind]) return say(file.name + ' is too large (max ' + LIMITS[kind] / 1048576 + ' MB for a ' + kind + ').', true);
      var item = { kind: kind, name: file.name, done: false };
      var el = document.createElement('div'); el.className = 'pv';
      el.innerHTML = kind === 'image' ? '<img alt="">' : kind === 'video' ? '<video muted playsinline></video>' : '<div class="fname">📄 ' + esc(file.name) + '</div>';
      if (kind !== 'file') el.firstChild.src = URL.createObjectURL(file);
      el.insertAdjacentHTML('beforeend', '<button type="button" aria-label="Remove">✕</button><span class="prog" style="width:0"></span>');
      el.querySelector('button').onclick = function () { items.splice(items.indexOf(item), 1); el.remove(); refreshSend(); };
      $('previews').appendChild(el); items.push(item); refreshSend();
      var prep = kind === 'image' ? shrinkImage(file) : Promise.resolve(file);
      var framesP = kind === 'video' ? videoFrames(file) : Promise.resolve(null);
      Promise.all([prep, framesP, uploader()]).then(function (r) {
        item.frames = r[1];
        var safe = r[0].name.replace(/[^\w.\-]+/g, '_').slice(-60) || 'file';
        return r[2].upload('wall-media/' + state.me.username + '/' + safe, r[0], {
          access: 'private', handleUploadUrl: '/api/community?upload=1', contentType: r[0].type,
          onUploadProgress: function (p) { el.querySelector('.prog').style.width = p.percentage + '%'; }
        });
      }).then(function (blob) {
        item.pathname = blob.pathname; item.done = true; el.querySelector('.prog').style.background = 'var(--green)'; refreshSend();
      }).catch(function (e) {
        say(file.name + ': ' + (e.message || 'upload failed'), true); items.splice(items.indexOf(item), 1); el.remove(); refreshSend();
      });
    });
  }
  function togglePoll(on) {
    pollOn = on; var box = $('pollEdit');
    if (on) {
      if (items.length) { pollOn = false; return say('Remove attachments to add a poll.', true); }
      box.hidden = false;
      box.innerHTML = '<input maxlength="60" placeholder="Choice 1"><input maxlength="60" placeholder="Choice 2"><div class="row"><button class="linkbtn" type="button" id="pollAdd">+ Add a choice</button><button class="linkbtn red" type="button" id="pollRemove">Remove poll</button></div>';
      $('pollAdd').onclick = function () { var n = box.querySelectorAll('input').length; if (n >= 4) return; box.querySelector('.row').insertAdjacentHTML('beforebegin', '<input maxlength="60" placeholder="Choice ' + (n + 1) + ' (optional)">'); if (n + 1 >= 4) this.hidden = true; };
      $('pollRemove').onclick = function () { togglePoll(false); };
      box.querySelector('input').focus();
      if (!$('text').value) $('text').placeholder = 'Ask a question…';
    } else { box.hidden = true; box.innerHTML = ''; $('text').placeholder = "What's happening?"; }
    refreshSend();
  }
  function initComposer() {
    var text = $('text');
    $('btnMedia').onclick = function () { $('pickMedia').click(); };
    $('btnFile').onclick = function () { $('pickFile').click(); };
    $('btnPoll').onclick = function () { togglePoll(!pollOn); };
    $('pickMedia').onchange = function () { addFiles(this.files); this.value = ''; };
    $('pickFile').onchange = function () { addFiles(this.files); this.value = ''; };
    $('pollEdit').addEventListener('input', refreshSend);
    var pop = $('emojiPop');
    pop.innerHTML = ['🔥', '🇺🇸', '😂', '💯', '👏', '😤', '🦅', '🌴', '⚔️', '👑', '😎', '🙏', '❤️', '😭', '🤣', '👀', '💪', '🫡', '🗽', '📢', '🎉', '🤝', '😡', '🤔'].map(function (x) { return '<button type="button">' + x + '</button>'; }).join('');
    $('btnEmoji').onclick = function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; };
    pop.onclick = function (e) { e.stopPropagation(); var b = e.target.closest('button'); if (!b) return; var s0 = text.selectionStart || text.value.length; text.value = text.value.slice(0, s0) + b.textContent + text.value.slice(s0); text.focus(); refreshSend(); };
    document.addEventListener('click', function (e) { if (!pop.contains(e.target) && e.target !== $('btnEmoji')) pop.hidden = true; });
    text.addEventListener('input', function () { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 320) + 'px'; refreshSend(); });
    text.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !$('send').disabled) $('send').click(); });
    document.addEventListener('dragover', function (e) { if (state.mediaEnabled) e.preventDefault(); });
    document.addEventListener('drop', function (e) { if (!state.mediaEnabled) return; e.preventDefault(); addFiles(e.dataTransfer.files); });
    text.addEventListener('paste', function (e) { if (state.mediaEnabled && e.clipboardData && e.clipboardData.files.length) addFiles(e.clipboardData.files); });
    $('send').addEventListener('click', function () {
      var btn = this; btn.disabled = true; say(items.length ? 'Checking and posting…' : 'Posting…');
      var frames = [];
      items.forEach(function (i) { if (i.frames) frames = frames.concat(i.frames); });
      var poll = pollOn ? Array.prototype.map.call(document.querySelectorAll('#pollEdit input'), function (i) { return i.value; }) : null;
      api({ action: 'post', text: text.value, poll: poll, media: items.map(function (i) { return { pathname: i.pathname, name: i.name }; }), frames: frames }).then(function (d) {
        state.authors[d.author.username] = d.author;
        if (route.tab !== 'latest' || route.tag || route.q || route.post || route.user || route.view) { go('/wall'); }
        else { var e = main.querySelector('.empty'); if (e) e.remove(); var pin = main.querySelector('.post .pinline'); var html = postHtml(d.post); if (pin) pin.closest('.post').insertAdjacentHTML('afterend', html); else main.insertAdjacentHTML('afterbegin', html); }
        text.value = ''; text.style.height = ''; items = []; $('previews').innerHTML = ''; togglePoll(false); say('');
        toast('Posted');
      }).catch(function (e) {
        say(e.message, true);
        if (e.data && e.data.banned) setTimeout(function () { location.replace('/signin?error=banned'); }, 3000);
        if (/^Blocked/.test(e.message)) { items = []; $('previews').innerHTML = ''; }
        refreshSend();
      });
    });
    refreshSend();
  }

  // ---------- start ----------
  document.addEventListener('DOMContentLoaded', function () {
    main = $('feed');
    document.querySelectorAll('[data-icon]').forEach(function (el) { el.insertAdjacentHTML('afterbegin', I[el.dataset.icon]); });
    $('backBtn').onclick = function () { if (history.length > 1) history.back(); else go('/wall'); };
    $('searchForm').onsubmit = function (e) { e.preventDefault(); var q = $('searchInput').value.trim(); if (q) go(q.charAt(0) === '#' ? '/wall?tag=' + encodeURIComponent(q.slice(1)) : '/wall?q=' + encodeURIComponent(q)); };
    $('fab').onclick = $('postBtn').onclick = function () { if (route.user || route.post || route.view || route.tab === 'saved' || route.q) go('/wall'); setTimeout(function () { $('text').focus(); }, 60); };
    initComposer();
    render();
    // Views other than the feed still need the sidebar (trending, unread count).
    if (route.user || route.post || route.view) getJSON('/api/community?view=wall').then(function (d) { boot(d); renderTrending(d.trending); d.posts.forEach(function (p) { state.posts[p.id] = state.posts[p.id] || p; }); }).catch(function () {});
    // Light polling: show a "new posts" bar instead of jumping the feed.
    setInterval(function () {
      if (document.hidden || route.user || route.post || route.view || route.tag || route.q || (route.tab || 'latest') !== 'latest') return;
      getJSON('/api/community?view=wall').then(function (d) {
        setUnread(d.unread);
        var known = d.posts.filter(function (p) { return !state.posts[p.id]; }).length;
        var bar = $('newbar');
        if (known) { bar.hidden = false; bar.textContent = 'Show ' + known + ' new post' + (known === 1 ? '' : 's'); } else bar.hidden = true;
      }).catch(function () {});
    }, 45000);
    $('newbar').onclick = function () { this.hidden = true; render(); };
  });
})();
