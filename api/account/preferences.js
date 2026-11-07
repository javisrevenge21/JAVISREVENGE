import { updateNotifications, updateProfile } from '../../lib/accounts.js';
import { requireSameOrigin, sessionFromRequest } from '../../lib/session.js';

// POST { notifications: true|false }  or  POST { profile: { displayName, bio, ... } }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });

  if (req.body && typeof req.body.profile === 'object' && req.body.profile) {
    const account = await updateProfile(session.email, req.body.profile);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.status(200).json({ name: account.name, profile: account.profile });
  }

  if (typeof req.body?.notifications !== 'boolean') return res.status(400).json({ error: 'Invalid preference' });
  const account = await updateNotifications(session.email, req.body.notifications);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  return res.status(200).json({ notifications: account.notifications });
}
