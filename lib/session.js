import crypto from 'node:crypto';

export const SESSION_COOKIE = 'jr_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(user, secret, now = Date.now()) {
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const payload = base64url(JSON.stringify({
    sub: user.sub,
    email: user.email,
    name: user.name || user.email,
    picture: user.picture || '',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE
  }));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, supplied, extra] = token.split('.');
  if (!payload || !supplied || extra) return null;
  const expected = signature(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || !data.email || !data.exp || data.exp <= Math.floor(now / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return [part.trim(), ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

export function sessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySession(cookies[SESSION_COOKIE], process.env.SESSION_SECRET);
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return origin === `${proto}://${host}`;
}

export function isAdmin(session) {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return !!session && admins.includes(session.email.toLowerCase());
}

export function unsubscribeToken(email, secret) {
  const normalized = email.trim().toLowerCase();
  return `${base64url(normalized)}.${signature(`unsubscribe:${normalized}`, secret)}`;
}

export function verifyUnsubscribeToken(token, secret) {
  if (!token || !secret) return null;
  const [encoded, supplied, extra] = token.split('.');
  if (!encoded || !supplied || extra) return null;
  try {
    const email = Buffer.from(encoded, 'base64url').toString('utf8').trim().toLowerCase();
    const expected = signature(`unsubscribe:${email}`, secret);
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? email : null;
  } catch {
    return null;
  }
}
