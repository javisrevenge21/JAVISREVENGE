import { updateNotifications, updateLanguage, updateProfile, claimUsername, normalizeUsername, usernameProblem, usernameTaken } from '../../lib/accounts.js';
import { blocklistHit } from '../../lib/moderation.js';
import { isPlus } from '../../lib/billing.js';
import { getAccount } from '../../lib/accounts.js';
import { isLanguage, languageCookie, autoTranslateOn, translateTexts } from '../../lib/translate.js';
import { isAdmin, requireSameOrigin, sessionFromRequest, createSession, sessionCookie } from '../../lib/session.js';

// POST { notifications: true|false }, { profile: { displayName, bio, ... } } or { language: 'es' }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });

  // On-the-fly translation of text with no ready-made translation:
  // POST { translate: ["..."], language: "es" }. Off unless AUTO_TRANSLATE=on.
  if (Array.isArray(req.body?.translate)) {
    if (!autoTranslateOn()) return res.status(200).json({ off: true });
    if (!isLanguage(req.body.language)) return res.status(400).json({ error: 'Unknown language' });
    const translations = await translateTexts(req.body.translate, req.body.language, { oidc: req.headers['x-vercel-oidc-token'] || '' });
    return res.status(200).json({ translations });
  }

  // Site language: POST { language: "es" }. Saved on the account and in a
  // cookie so every page shows in it straight away.
  if (typeof req.body?.language === 'string') {
    if (!isLanguage(req.body.language)) return res.status(400).json({ error: 'Unknown language' });
    const account = await updateLanguage(session.email, req.body.language);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.setHeader('Set-Cookie', languageCookie(account.language));
    return res.status(200).json({ language: account.language });
  }

  // Check availability as the person types: POST { checkUsername: "name" }
  if (typeof req.body?.checkUsername === 'string') {
    const name = normalizeUsername(req.body.checkUsername);
    const problem = usernameProblem(name) || (blocklistHit(name) ? 'That username is not available.' : null);
    if (problem) return res.status(200).json({ available: false, message: problem });
    const taken = await usernameTaken(name);
    return res.status(200).json({ available: !taken, message: taken ? 'That username is taken.' : 'Available!' });
  }

  // Claim: POST { username: "name" }. Re-issues the session so the site
  // stops asking for a username.
  if (typeof req.body?.username === 'string') {
    if (blocklistHit(req.body.username)) return res.status(409).json({ error: 'That username is not available.' });
    const result = await claimUsername(session.email, req.body.username, req.body.agree === true, req.body.lang);
    if (result.error) return res.status(409).json({ error: result.error });
    const cookies = [sessionCookie(createSession(result.account, process.env.SESSION_SECRET))];
    if (result.account.language) cookies.push(languageCookie(result.account.language));
    res.setHeader('Set-Cookie', cookies);
    return res.status(200).json({ username: result.account.username });
  }

  if (req.body && typeof req.body.profile === 'object' && req.body.profile) {
    const pf = req.body.profile;
    const words = ['displayName', 'bio', 'location', 'quote', 'pronouns', 'instagram', 'x', 'tiktok', 'snapchat', 'discord', 'youtube', 'twitch', 'threads'].map(k => String(pf[k] || '')).join('\n');
    if (blocklistHit(words)) return res.status(422).json({ error: 'Your profile contains words that are not allowed on JAVISREVENGE.' });
    const current = await getAccount(session.email);
    const account = await updateProfile(session.email, req.body.profile, isPlus(current) || isAdmin(session));
    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.status(200).json({ name: account.name, profile: account.profile });
  }

  if (typeof req.body?.notifications !== 'boolean') return res.status(400).json({ error: 'Invalid preference' });
  const account = await updateNotifications(session.email, req.body.notifications);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  return res.status(200).json({ notifications: account.notifications });
}
