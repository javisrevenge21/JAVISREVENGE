import { sessionFromRequest, isAdmin } from '../../lib/session.js';
import { getAccount, isBanned } from '../../lib/accounts.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ authenticated: false });
  const account = await getAccount(session.email);
  if (!account || await isBanned(account.email)) return res.status(401).json({ authenticated: false });
  return res.status(200).json({
    authenticated: true,
    user: { email: account.email, username: account.username || '', name: account.name, picture: account.picture, avatar: account.profile?.avatar || '', theme: account.profile?.theme || 'silver', title: account.profile?.title || '' },
    notifications: account.notifications === true,
    notificationsAsked: account.notificationsAsked === true || account.notifications === true,
    admin: isAdmin(session)
  });
}
