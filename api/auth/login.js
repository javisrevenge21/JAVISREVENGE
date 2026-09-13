import crypto from 'node:crypto';
import { safeReturnTo } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured' });

  const state = crypto.randomBytes(32).toString('base64url');
  const returnTo = safeReturnTo(req.query.returnTo);
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const redirectUri = `${origin}/api/auth/callback`;
  const mode = req.query.mode === 'signup' ? 'consent' : 'select_account';
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: mode
  });

  res.setHeader('Set-Cookie', [
    `jr_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `jr_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  ]);
  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
