(function () {
  // Pages that anyone can see load this script with a data-public attribute.
  // There, signed-out visitors get a "Sign in" link instead of a redirect.
  var script = document.currentScript;
  var isPublic = !!(script && script.hasAttribute('data-public'));
  var style = document.createElement('style');
  style.textContent = [
    '.jr-account{position:fixed;z-index:50;top:16px;right:16px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(8,8,10,.82);border:1px solid rgba(255,255,255,.16);border-radius:999px;backdrop-filter:blur(14px);font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}',
    '.jr-emoji{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:17px}',
    '.jr-account img{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#222}',
    '.jr-account a{color:#fff;text-decoration:none}.jr-account a:hover{text-decoration:underline}',
    '.jr-legal{position:relative;z-index:20;display:flex;justify-content:center;flex-wrap:wrap;gap:16px;padding:20px 18px 30px;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgba(255,255,255,.55)}',
    '.jr-legal a{color:inherit;text-decoration:none}.jr-legal a:hover{color:#fff}',
    '.jr-optin{position:fixed;z-index:60;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}',
    '.jr-optin-card{width:100%;max-width:400px;padding:24px;background:#0b0b0d;border:1px solid rgba(255,255,255,.16);border-radius:16px;color:#fff;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}',
    '.jr-optin-card h2{font-size:18px;letter-spacing:.08em;margin-bottom:10px}.jr-optin-card p{color:rgba(255,255,255,.72);margin-bottom:18px;word-break:break-word}',
    '.jr-optin-card button{display:block;width:100%;padding:12px;margin-top:10px;border-radius:10px;font:600 14px inherit;cursor:pointer;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff}',
    '.jr-optin-card button.yes{background:#fff;color:#000;border-color:#fff}',
    '.jr-account.jr-guest{padding:9px 16px;letter-spacing:.14em;text-transform:uppercase;font-size:11px;font-weight:600}',
    '.jr-trigger{display:flex;align-items:center;gap:9px;background:none;border:0;color:#fff;font:inherit;cursor:pointer;padding:0 2px}',
    '.jr-chev{width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2.5;transition:transform .2s}.jr-account.open .jr-chev{transform:rotate(180deg)}',
    '.jr-account{padding:6px 10px 6px 6px}',
    '.jr-menu{position:absolute;top:calc(100% + 8px);right:0;width:270px;padding:8px;background:#0e0f12;border:1px solid rgba(var(--t),.45);border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.6),0 0 30px rgba(var(--t),.15);animation:jrdrop .16s ease-out}',
    '@keyframes jrdrop{from{opacity:0;transform:translateY(-6px)}}',
    '.jr-menu a{display:block;padding:10px 12px;border-radius:10px;color:#fff;text-decoration:none!important;font-size:14px}.jr-menu a:hover{background:rgba(255,255,255,.07)}',
    '.jr-menu a.jr-mini{display:flex;gap:12px;align-items:center;padding:14px 12px;margin-bottom:6px;background:linear-gradient(135deg,rgba(var(--t),.45),rgba(var(--t),.08));border:1px solid rgba(var(--t),.5)}',
    '.jr-mini-av{width:52px;height:52px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:28px;overflow:hidden;border:2px solid rgb(var(--t));background:rgba(var(--t),.3)}.jr-mini-av img{width:100%;height:100%;object-fit:cover}',
    '.jr-mini-txt{min-width:0;display:flex;flex-direction:column;gap:1px}.jr-mini-txt b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jr-mini-txt span{font-size:13px;color:rgba(255,255,255,.65)}',
    '.jr-mini-txt em{font-style:normal;align-self:flex-start;margin-top:4px;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;padding:2px 6px;border-radius:5px;background:rgb(var(--t));color:#000}',
    '.jr-mini-txt small{font-size:12px;color:rgba(255,255,255,.75);margin-top:3px}',
    '.jr-menu a.jr-out{color:#fca5a5;border-top:1px solid rgba(255,255,255,.08);border-radius:0 0 10px 10px;margin-top:4px}',
    '@media(max-width:600px){.jr-account-name{display:none}.jr-menu{width:min(290px,calc(100vw - 24px))}}'
  ].join('');
  document.head.appendChild(style);

  fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('not signed in');
      return response.json();
    })
    .then(function (data) {
      var bar = document.createElement('nav');
      bar.className = 'jr-account';
      bar.setAttribute('aria-label', 'Account');
      var THEMES = { silver: '200,205,214', red: '220,38,38', gold: '212,160,23', blue: '37,99,235', purple: '147,51,234', green: '22,163,74', pink: '219,39,119', orange: '234,88,12' };
      var rgb = THEMES[data.user.theme] || THEMES.silver;
      bar.style.borderColor = 'rgba(' + rgb + ',.6)';
      bar.style.boxShadow = '0 0 22px rgba(' + rgb + ',.25)';
      var picture = data.user.avatar
        ? '<span class="jr-emoji" style="background:rgba(' + rgb + ',.3)">' + escapeHtml(data.user.avatar) + '</span>'
        : (data.user.picture ? '<img src="' + escapeAttribute(data.user.picture) + '" alt="">' : '');
      var u = data.user;
      var handle = u.username ? '@' + u.username : u.name;
      var profileUrl = u.username ? '/u/' + encodeURIComponent(u.username) : '/account';
      var bigPic = u.avatar ? escapeHtml(u.avatar) : (u.picture ? '<img src="' + escapeAttribute(u.picture) + '" alt="">' : escapeHtml((u.name || '?').charAt(0).toUpperCase()));
      bar.innerHTML =
        '<button class="jr-trigger" type="button" aria-haspopup="true" aria-expanded="false">' + (picture || '<span class="jr-emoji" style="background:rgba(' + rgb + ',.3)">' + escapeHtml((u.name || '?').charAt(0).toUpperCase()) + '</span>') +
        '<span class="jr-account-name">' + escapeHtml(handle) + '</span><svg class="jr-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
        '<div class="jr-menu" role="menu" hidden style="--t:' + rgb + '">' +
          '<a class="jr-mini" href="' + profileUrl + '" role="menuitem">' +
            '<span class="jr-mini-av">' + bigPic + '</span>' +
            '<span class="jr-mini-txt"><b>' + escapeHtml(u.name) + '</b><span>' + escapeHtml(u.username ? '@' + u.username : '') + '</span>' +
            (u.title && u.title !== 'Member' ? '<em>' + escapeHtml(u.title) + '</em>' : '') + (u.mood ? '<small>' + escapeHtml(u.mood) + '</small>' : '') + '</span></a>' +
          '<a href="' + profileUrl + '" role="menuitem">👤 View my profile</a>' +
          '<a href="/account" role="menuitem">🎨 Edit profile &amp; settings</a>' +
          '<a href="/wall" role="menuitem">🏠 The Wall</a>' +
          (data.admin ? '<a href="/admin" role="menuitem">🛡️ Admin</a>' : '') +
          '<a href="/api/auth/logout" role="menuitem" class="jr-out">↩ Sign out</a>' +
        '</div>';
      var trigger = bar.querySelector('.jr-trigger'), menu = bar.querySelector('.jr-menu');
      function setOpen(open) { menu.hidden = !open; trigger.setAttribute('aria-expanded', open ? 'true' : 'false'); bar.classList.toggle('open', open); }
      trigger.addEventListener('click', function (e) { e.stopPropagation(); setOpen(menu.hidden); });
      document.addEventListener('click', function (e) { if (!bar.contains(e.target)) setOpen(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
      document.body.appendChild(bar);
      if (!data.notificationsAsked) askForNotifications(data.user.email);
    })
    .catch(function () {
      var returnTo = encodeURIComponent(location.pathname + location.search);
      if (!isPublic) {
        window.location.replace('/signin?returnTo=' + returnTo);
        return;
      }
      var bar = document.createElement('nav');
      bar.className = 'jr-account jr-guest';
      bar.setAttribute('aria-label', 'Account');
      bar.innerHTML = '<a href="/signin?returnTo=' + returnTo + '">Sign in</a>';
      document.body.appendChild(bar);
    });

  var footer = document.createElement('footer');
  footer.className = 'jr-legal';
  footer.innerHTML = '<a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookies</a><a href="/account">Account &amp; notifications</a>';
  document.body.appendChild(footer);

  function askForNotifications(email) {
    var overlay = document.createElement('div');
    overlay.className = 'jr-optin';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div class="jr-optin-card"><h2>STAY IN THE LOOP</h2><p>Can we send email notifications about JAVISREVENGE updates to <strong>' + escapeHtml(email) + '</strong>? You can turn this off any time.</p><button class="yes" type="button">Yes, email me</button><button class="no" type="button">No thanks</button></div>';
    document.body.appendChild(overlay);
    function choose(value) {
      overlay.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      fetch('/api/account/preferences', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: value })
      }).finally(function () { overlay.remove(); });
    }
    overlay.querySelector('.yes').onclick = function () { choose(true); };
    overlay.querySelector('.no').onclick = function () { choose(false); };
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }
  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();
