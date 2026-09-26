import { unsubscribeToken } from './session.js';

export const REQUIRED_EMAIL_ENV = ['RESEND_API_KEY', 'EMAIL_FROM', 'BUSINESS_POSTAL_ADDRESS', 'SESSION_SECRET'];

export function missingEmailEnv() {
  return REQUIRED_EMAIL_ENV.filter(name => !process.env[name]);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function buildEmail({ to, subject, message, origin }) {
  const token = unsubscribeToken(to, process.env.SESSION_SECRET);
  const unsubscribeUrl = `${origin}/unsubscribe?token=${encodeURIComponent(token)}`;
  const address = process.env.BUSINESS_POSTAL_ADDRESS;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
    <div style="white-space:pre-wrap">${escapeHtml(message)}</div>
    <hr style="margin-top:32px;border:0;border-top:1px solid #ddd">
    <p style="font-size:12px;color:#666">Sent by JAVISREVENGE, ${escapeHtml(address)}.</p>
    <p style="font-size:12px"><a href="${unsubscribeUrl}">Turn off email notifications</a></p>
  </body></html>`;
  return {
    from: process.env.EMAIL_FROM,
    to: [to],
    subject,
    text: `${message}\n\nSent by JAVISREVENGE, ${address}.\nTurn off notifications: ${unsubscribeUrl}`,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  };
}

export async function sendBatch(emails) {
  // Resend batch endpoint accepts up to 100 emails per request.
  let sent = 0;
  const failures = [];
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk)
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) sent += chunk.length;
    else failures.push(result.message || `Batch ${i / 100 + 1} was rejected`);
  }
  return { sent, failures };
}
