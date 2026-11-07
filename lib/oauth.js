// Third-party sign-in providers. Every provider uses the same callback URL
// (/api/auth/callback); the provider name travels in a short-lived cookie set
// by /api/auth/login. A provider only appears on the sign-in page once its
// client ID and secret are set in Vercel.
//
// Accounts are keyed by verified email address, so signing in with Google
// and then with Discord using the same email opens the same account.

async function json(response, what) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${what} failed (${response.status})`);
  return body;
}

async function exchange(url, params, extraHeaders = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...extraHeaders },
    body: new URLSearchParams(params)
  });
  const tokens = await json(response, 'Token exchange');
  if (tokens.error) throw new Error('Token exchange failed: ' + tokens.error);
  return tokens;
}

export const PROVIDERS = {
  google: {
    label: 'Google',
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    extraParams: mode => ({ prompt: mode === 'signup' ? 'consent' : 'select_account' }),
    async profile(code, redirectUri) {
      const tokens = await exchange('https://oauth2.googleapis.com/token', {
        code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code'
      });
      if (!tokens.id_token) throw new Error('No Google id_token');
      const p = await json(await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`), 'Google verify');
      if (p.aud !== process.env.GOOGLE_CLIENT_ID || p.email_verified !== 'true') throw new Error('Google identity verification failed');
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(p.iss)) throw new Error('Unexpected issuer');
      return { sub: 'google:' + p.sub, email: p.email, name: p.name, picture: p.picture };
    }
  },

  microsoft: {
    label: 'Microsoft',
    env: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    // Personal Microsoft accounts only (Outlook, Hotmail, Xbox, Skype). Work and
    // school tenants are excluded because their email claim isn't guaranteed
    // to be verified.
    authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    scope: 'openid email profile User.Read',
    extraParams: () => ({ prompt: 'select_account' }),
    async profile(code, redirectUri) {
      const tokens = await exchange('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        code, client_id: process.env.MICROSOFT_CLIENT_ID, client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code', scope: 'openid email profile User.Read'
      });
      const me = await json(await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } }), 'Microsoft profile');
      const email = me.mail || me.userPrincipalName;
      if (!me.id || !email || !email.includes('@')) throw new Error('Microsoft account has no email');
      return { sub: 'microsoft:' + me.id, email, name: me.displayName, picture: '' };
    }
  },

  discord: {
    label: 'Discord',
    env: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    scope: 'identify email',
    extraParams: () => ({ prompt: 'consent' }),
    async profile(code, redirectUri) {
      const tokens = await exchange('https://discord.com/api/oauth2/token', {
        code, client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code'
      });
      const u = await json(await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } }), 'Discord profile');
      if (!u.email || u.verified !== true) throw new Error('Discord email is not verified');
      const picture = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : '';
      return { sub: 'discord:' + u.id, email: u.email, name: u.global_name || u.username, picture };
    }
  },

  github: {
    label: 'GitHub',
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    scope: 'read:user user:email',
    extraParams: () => ({ allow_signup: 'true' }),
    async profile(code, redirectUri) {
      const tokens = await exchange('https://github.com/login/oauth/access_token', {
        code, client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, redirect_uri: redirectUri
      });
      const headers = { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'javisrevenge.com' };
      const u = await json(await fetch('https://api.github.com/user', { headers }), 'GitHub profile');
      const emails = await json(await fetch('https://api.github.com/user/emails', { headers }), 'GitHub emails');
      const primary = (emails || []).find(e => e.primary && e.verified) || (emails || []).find(e => e.verified);
      if (!primary) throw new Error('GitHub account has no verified email');
      return { sub: 'github:' + u.id, email: primary.email, name: u.name || u.login, picture: u.avatar_url || '' };
    }
  }
};

export function isEnabled(name) {
  const p = PROVIDERS[name];
  return !!p && p.env.every(key => process.env[key]);
}

export function enabledProviders() {
  return Object.keys(PROVIDERS).filter(isEnabled).map(id => ({ id, label: PROVIDERS[id].label }));
}

export function clientId(name) {
  return process.env[PROVIDERS[name].env[0]];
}
