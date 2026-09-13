import { updateNotifications } from '../lib/accounts.js';
import { verifyUnsubscribeToken } from '../lib/session.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const token = req.method === 'POST' ? req.body?.token || req.query.token : req.query.token;
  const email = verifyUnsubscribeToken(token, process.env.SESSION_SECRET);
  if (!email) return res.status(400).json({ error: 'This unsubscribe link is invalid' });
  const account = await updateNotifications(email, false);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (req.method === 'POST' && req.headers['list-unsubscribe'] === 'One-Click') return res.status(200).end();
  return res.redirect(303, '/unsubscribe?done=1');
}
