(function () {
  var style = document.createElement('style');
  style.textContent = [
    '.jr-account{position:fixed;z-index:50;top:16px;right:16px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(8,8,10,.82);border:1px solid rgba(255,255,255,.16);border-radius:999px;backdrop-filter:blur(14px);font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}',
    '.jr-account img{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#222}',
    '.jr-account a{color:#fff;text-decoration:none}.jr-account a:hover{text-decoration:underline}',
    '.jr-legal{position:relative;z-index:20;display:flex;justify-content:center;flex-wrap:wrap;gap:16px;padding:20px 18px 30px;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgba(255,255,255,.55)}',
    '.jr-legal a{color:inherit;text-decoration:none}.jr-legal a:hover{color:#fff}',
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
    })
    .catch(function () {
      window.location.replace('/signin?returnTo=' + encodeURIComponent(location.pathname + location.search));
    });

  var footer = document.createElement('footer');
  footer.className = 'jr-legal';
  footer.innerHTML = '<a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookies</a><a href="/account">Account &amp; notifications</a>';
  document.body.appendChild(footer);

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }
  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();
