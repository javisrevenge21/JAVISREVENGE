import { deleteAccount, getAccount } from '../../lib/accounts.js';
import { clearCookie, requireSameOrigin, sessionFromRequest, SESSION_COOKIE } from '../../lib/session.js';

export default async function handler(req, res) {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });

  if (req.method === 'GET') {
    const account = await getAccount(session.email);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.status(200).json({
      email: account.email,
      name: account.name,
      picture: account.picture,
      notifications: account.notifications === true,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt
    });
  }

  if (req.method === 'DELETE') {
    if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
    await deleteAccount(session.email);
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
    return res.status(200).json({ deleted: true });
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
