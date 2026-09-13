import { getAccount } from '../../lib/accounts.js';
import { isAdmin, requireSameOrigin, sessionFromRequest, unsubscribeToken } from '../../lib/session.js';

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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

  const required = ['RESEND_API_KEY', 'EMAIL_FROM', 'BUSINESS_POSTAL_ADDRESS', 'SESSION_SECRET'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) return res.status(503).json({ error: `Email is not configured (${missing.join(', ')})` });

  const token = unsubscribeToken(account.email, process.env.SESSION_SECRET);
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const unsubscribeUrl = `${origin}/unsubscribe?token=${encodeURIComponent(token)}`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
    <div style="white-space:pre-wrap">${escapeHtml(message)}</div>
    <hr style="margin-top:32px;border:0;border-top:1px solid #ddd">
    <p style="font-size:12px;color:#666">Sent by JAVISREVENGE, ${escapeHtml(process.env.BUSINESS_POSTAL_ADDRESS)}.</p>
    <p style="font-size:12px"><a href="${unsubscribeUrl}">Turn off email notifications</a></p>
  </body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [account.email],
      subject,
      text: `${message}\n\nSent by JAVISREVENGE, ${process.env.BUSINESS_POSTAL_ADDRESS}.\nTurn off notifications: ${unsubscribeUrl}`,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    })
  });
  const result = await response.json();
  if (!response.ok) return res.status(502).json({ error: result.message || 'Email provider rejected the message' });
  return res.status(200).json({ sent: true, id: result.id });
}
