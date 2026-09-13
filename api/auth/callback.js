import { createSession, sessionCookie, clearCookie, parseCookies, safeReturnTo } from '../../lib/session.js';
import { upsertGoogleAccount } from '../../lib/accounts.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const cookies = parseCookies(req.headers.cookie || '');
  if (!req.query.code || !req.query.state || req.query.state !== cookies.jr_oauth_state) {
    return res.redirect(302, '/signin?error=oauth');
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'Authentication is not fully configured' });
  }

  try {
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token) throw new Error('Token exchange failed');

    const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    const profile = await verifyResponse.json();
    if (!verifyResponse.ok || profile.aud !== process.env.GOOGLE_CLIENT_ID || profile.email_verified !== 'true') {
      throw new Error('Google identity verification failed');
    }
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss)) {
      throw new Error('Unexpected identity issuer');
    }

    const account = await upsertGoogleAccount(profile);
    const token = createSession(account, process.env.SESSION_SECRET);
    res.setHeader('Set-Cookie', [sessionCookie(token), clearCookie('jr_oauth_state'), clearCookie('jr_return_to')]);
    return res.redirect(302, safeReturnTo(cookies.jr_return_to));
  } catch (error) {
    console.error('Google sign-in failed:', error && error.message);
    return res.redirect(302, '/signin?error=oauth');
  }
}
