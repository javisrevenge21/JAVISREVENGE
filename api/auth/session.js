import { sessionFromRequest, isAdmin } from '../../lib/session.js';
import { getAccount } from '../../lib/accounts.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ authenticated: false });
  const account = await getAccount(session.email);
  if (!account) return res.status(401).json({ authenticated: false });
  return res.status(200).json({
    authenticated: true,
    user: { email: account.email, name: account.name, picture: account.picture },
    notifications: account.notifications === true,
    admin: isAdmin(session)
  });
}
