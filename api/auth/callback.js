import { createSession, sessionCookie, clearCookie, parseCookies, safeReturnTo } from '../../lib/session.js';
import { upsertAccount } from '../../lib/accounts.js';
import { PROVIDERS, isEnabled } from '../../lib/oauth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const cookies = parseCookies(req.headers.cookie || '');
  // Sign-ins started before this change have no provider cookie: they were Google.
  const provider = cookies.jr_oauth_provider || 'google';
  if (!req.query.code || !req.query.state || req.query.state !== cookies.jr_oauth_state || !PROVIDERS[provider]) {
    return res.redirect(302, '/signin?error=oauth');
  }
  if (!isEnabled(provider) || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'Authentication is not fully configured' });
  }

  try {
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    const profile = await PROVIDERS[provider].profile(String(req.query.code), `${origin}/api/auth/callback`);
    const account = await upsertAccount(profile, provider);
    const token = createSession(account, process.env.SESSION_SECRET);
    res.setHeader('Set-Cookie', [sessionCookie(token), clearCookie('jr_oauth_state'), clearCookie('jr_oauth_provider'), clearCookie('jr_return_to')]);
    return res.redirect(302, safeReturnTo(cookies.jr_return_to));
  } catch (error) {
    console.error(`${provider} sign-in failed:`, error && error.message);
    return res.redirect(302, '/signin?error=oauth');
  }
}
