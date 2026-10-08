// PT2 waitlist signup. Public (no sign-in needed; see middleware.js).
// Stores the email in private Vercel Blob storage and sends one confirmation
// email through Resend, using the same helpers as the member opt-in emails.
import { addToWaitlist, isValidEmail, normalizeEmail } from '../lib/waitlist.js';
import { requireSameOrigin } from '../lib/session.js';
import { buildEmail, missingEmailEnv } from '../lib/email.js';

const CONFIRM_SUBJECT = "You're on the JAVISREVENGE PT2 list";
const CONFIRM_MESSAGE = [
  "You're on the list.",
  '',
  "PT1 is done. PT2 is coming. We'll email you when it drops.",
  '',
  'JAVISREVENGE',
  'https://www.javisrevenge.com'
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });

  // Honeypot: real people never fill the hidden "website" field.
  if (req.body?.website) return res.status(200).json({ joined: true });

  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!process.env.SESSION_SECRET || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'The waitlist is not available right now.' });
  }

  let created;
  try {
    ({ created } = await addToWaitlist(email, 'home'));
  } catch (error) {
    console.error('Waitlist save failed:', error && error.message);
    return res.status(500).json({ error: 'Could not save your signup. Please try again.' });
  }

  // Confirmation email is best effort: the signup still counts if email
  // isn't configured or Resend is down.
  let emailed = false;
  if (created && !missingEmailEnv().length) {
    try {
      const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEmail({ to: email, subject: CONFIRM_SUBJECT, message: CONFIRM_MESSAGE, origin }))
      });
      emailed = response.ok;
      if (!response.ok) console.error('Waitlist confirmation rejected:', response.status);
    } catch (error) {
      console.error('Waitlist confirmation failed:', error && error.message);
    }
  }

  return res.status(200).json({ joined: true, alreadyJoined: !created, emailed });
}
