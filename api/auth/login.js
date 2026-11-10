import crypto from 'node:crypto';
import { safeReturnTo } from '../../lib/session.js';
import { PROVIDERS, isEnabled, enabledProviders, clientId } from '../../lib/oauth.js';
import { queryOf } from '../../lib/query.js';

// GET /api/auth/login?provider=google|microsoft|discord|github[&mode=signup][&returnTo=/x]
// GET /api/auth/login?list=1 -> which providers are set up (for the sign-in page)
export default async function handler(req, res) {
  const query = queryOf(req);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (query.list) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ providers: enabledProviders() });
  }

  const provider = String(query.provider || 'google');
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Unknown sign-in provider' });
  if (!isEnabled(provider)) return res.status(503).json({ error: `${PROVIDERS[provider].label} sign-in is not configured` });

  const state = crypto.randomBytes(32).toString('base64url');
  const returnTo = safeReturnTo(query.returnTo);
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const p = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientId(provider),
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: 'code',
    scope: p.scope,
    state,
    ...p.extraParams(query.mode)
  });

  res.setHeader('Set-Cookie', [
    `jr_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `jr_oauth_provider=${provider}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `jr_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  ]);
  return res.redirect(302, `${p.authorizeUrl}?${params}`);
}
