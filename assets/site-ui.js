(function () {
  // Pages that anyone can see load this script with a data-public attribute.
  // There, signed-out visitors get a "Sign in" link instead of a redirect.
  var script = document.currentScript;
  var isPublic = !!(script && script.hasAttribute('data-public'));
  var style = document.createElement('style');
  style.textContent = [
    '.jr-account{position:fixed;z-index:50;top:16px;right:16px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(8,8,10,.82);border:1px solid rgba(255,255,255,.16);border-radius:999px;backdrop-filter:blur(14px);font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}',
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
    '@media(max-width:600px){.jr-account-name{display:none}}'
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
      var picture = data.user.picture ? '<img src="' + escapeAttribute(data.user.picture) + '" alt="">' : '';
      var admin = data.admin ? '<a href="/admin">Admin</a><span aria-hidden="true">·</span>' : '';
      bar.innerHTML = picture + '<a class="jr-account-name" href="/account">' + escapeHtml(data.user.name) + '</a><span aria-hidden="true">·</span>' + admin + '<a href="/api/auth/logout">Sign out</a>';
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
