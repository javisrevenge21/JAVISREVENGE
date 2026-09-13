import { listAccounts } from '../../lib/accounts.js';
import { isAdmin, sessionFromRequest } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = sessionFromRequest(req);
  if (!isAdmin(session)) return res.status(403).json({ error: 'Admin access required' });
  const users = (await listAccounts()).map(account => ({
    email: account.email,
    name: account.name,
    notifications: account.notifications === true,
    createdAt: account.createdAt,
    lastSignInAt: account.lastSignInAt
  }));
  return res.status(200).json({ users });
}
