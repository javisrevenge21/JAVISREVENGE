import { getAccount } from '../../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../../lib/session.js';
import { buildEmail, missingEmailEnv } from '../../lib/email.js';

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const session = sessionFromRequest(req);
  if (!isAdmin(session)) return res.status(403).json({ error: 'Admin access required' });

  const email = cleanText(req.body?.email, 320).toLowerCase();
  const subject = cleanText(req.body?.subject, 160);
  const message = cleanText(req.body?.message, 10000);
  if (!email || !subject || !message) return res.status(400).json({ error: 'Email, subject, and message are required' });

  const account = await getAccount(email);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (!account.notifications) return res.status(409).json({ error: 'This person has notifications turned off' });

  const missing = missingEmailEnv();
  if (missing.length) return res.status(503).json({ error: `Email is not configured (${missing.join(', ')})` });

  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildEmail({ to: account.email, subject, message, origin }))
  });
  const result = await response.json();
  if (!response.ok) return res.status(502).json({ error: result.message || 'Email provider rejected the message' });
  return res.status(200).json({ sent: true, id: result.id });
}
