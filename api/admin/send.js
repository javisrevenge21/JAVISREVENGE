import { getAccount, listAccounts } from '../../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../../lib/session.js';
import { buildEmail, missingEmailEnv, sendBatch } from '../../lib/email.js';
import { listWaitlist } from '../../lib/waitlist.js';

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const session = sessionFromRequest(req);
  if (!isAdmin(session)) return res.status(403).json({ error: 'Admin access required' });

  if (req.body?.all === true) return broadcast(req, res);

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

// "Email everyone": sends to every member who opted in (and, if asked, the PT2 waitlist). Lives in this file
// because the Vercel Hobby plan allows at most 12 serverless functions.
async function broadcast(req, res) {
  const subject = cleanText(req.body?.subject, 160);
  const message = cleanText(req.body?.message, 10000);
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });
  const missing = missingEmailEnv();
  if (missing.length) return res.status(503).json({ error: `Email is not configured (${missing.join(', ')})` });
  const members = (await listAccounts()).filter(account => account.notifications === true).map(account => account.email);
  // Optional: also email everyone on the PT2 waitlist (deduplicated).
  const waitlist = req.body?.includeWaitlist === true ? (await listWaitlist()).map(entry => entry.email) : [];
  const recipients = [...new Set([...members, ...waitlist].map(email => email.trim().toLowerCase()))];
  if (!recipients.length) return res.status(409).json({ error: 'Nobody has email notifications turned on yet' });
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const emails = recipients.map(to => buildEmail({ to, subject, message, origin }));
  const { sent, failures } = await sendBatch(emails);
  if (!sent) return res.status(502).json({ error: failures[0] || 'Email provider rejected the message' });
  return res.status(200).json({ sent, total: recipients.length, failures });
}
