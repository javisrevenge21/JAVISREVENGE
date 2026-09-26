import { listAccounts } from '../../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../../lib/session.js';
import { buildEmail, missingEmailEnv, sendBatch } from '../../lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const session = sessionFromRequest(req);
  if (!isAdmin(session)) return res.status(403).json({ error: 'Admin access required' });

  const subject = String(req.body?.subject || '').trim().slice(0, 160);
  const message = String(req.body?.message || '').trim().slice(0, 10000);
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

  const missing = missingEmailEnv();
  if (missing.length) return res.status(503).json({ error: `Email is not configured (${missing.join(', ')})` });

  const recipients = (await listAccounts()).filter(account => account.notifications === true);
  if (!recipients.length) return res.status(409).json({ error: 'Nobody has email notifications turned on yet' });

  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const emails = recipients.map(account => buildEmail({ to: account.email, subject, message, origin }));
  const { sent, failures } = await sendBatch(emails);
  if (!sent) return res.status(502).json({ error: failures[0] || 'Email provider rejected the message' });
  return res.status(200).json({ sent, total: recipients.length, failures });
}
