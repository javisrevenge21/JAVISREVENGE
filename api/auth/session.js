import { sessionFromRequest, isAdmin, clearCookie, SESSION_COOKIE } from '../../lib/session.js';
import { getAccount, isBanned } from '../../lib/accounts.js';
import { queryOf } from '../../lib/query.js';

export default async function handler(req, res) {
  const query = queryOf(req);
  // /api/auth/logout is rewritten here (vercel.json) so sign-out doesn't need
  // its own function; the Hobby plan allows 12 including middleware.
  if (query.logout) {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
    return res.redirect(303, '/signin');
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ authenticated: false });
  const account = await getAccount(session.email);
  if (!account || await isBanned(account.email)) return res.status(401).json({ authenticated: false });
  return res.status(200).json({
    authenticated: true,
    user: { email: account.email, username: account.username || '', name: account.name, picture: account.picture, avatar: account.profile?.avatar || '', theme: account.profile?.theme || 'silver', title: account.profile?.title || '', mood: account.profile?.mood || '' },
    notifications: account.notifications === true,
    notificationsAsked: account.notificationsAsked === true || account.notifications === true,
    admin: isAdmin(session)
  });
}
