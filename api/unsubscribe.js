import { updateNotifications } from '../lib/accounts.js';
import { handleWaitlistSignup, removeFromWaitlist } from '../lib/waitlist.js';
import { verifyUnsubscribeToken } from '../lib/session.js';

// This function handles the whole email list: unsubscribing, and (through the
// /api/waitlist rewrite in vercel.json) PT2 waitlist signups. Both live in
// one file because the Vercel Hobby plan caps a deployment at 12 functions.
export default async function handler(req, res) {
  if (req.query?.action === 'join-waitlist') return handleWaitlistSignup(req, res);

  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const token = req.method === 'POST' ? req.body?.token || req.query.token : req.query.token;
  const email = verifyUnsubscribeToken(token, process.env.SESSION_SECRET);
  if (!email) return res.status(400).json({ error: 'This unsubscribe link is invalid' });
  // One unsubscribe link stops every kind of email: member updates and the PT2 waitlist.
  await updateNotifications(email, false);
  await removeFromWaitlist(email).catch(error => {
    console.error('Waitlist removal failed:', error && error.message);
  });
  // RFC 8058 one-click: mail apps POST "List-Unsubscribe=One-Click" in the body.
  const oneClick = req.body?.['List-Unsubscribe'] === 'One-Click' || req.headers['list-unsubscribe'] === 'One-Click';
  if (req.method === 'POST' && oneClick) return res.status(200).end();
  return res.redirect(303, '/unsubscribe?done=1');
}
