import { clearCookie, SESSION_COOKIE } from '../../lib/session.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
  return res.redirect(303, '/signin');
}
