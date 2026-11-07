import { updateNotifications, updateProfile, claimUsername, normalizeUsername, usernameProblem, usernameTaken } from '../../lib/accounts.js';
import { requireSameOrigin, sessionFromRequest, createSession, sessionCookie } from '../../lib/session.js';

// POST { notifications: true|false }  or  POST { profile: { displayName, bio, ... } }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });

  // Check availability as the person types: POST { checkUsername: "name" }
  if (typeof req.body?.checkUsername === 'string') {
    const name = normalizeUsername(req.body.checkUsername);
    const problem = usernameProblem(name);
    if (problem) return res.status(200).json({ available: false, message: problem });
    const taken = await usernameTaken(name);
    return res.status(200).json({ available: !taken, message: taken ? 'That username is taken.' : 'Available!' });
  }

  // Claim: POST { username: "name" }. Re-issues the session so the site
  // stops asking for a username.
  if (typeof req.body?.username === 'string') {
    const result = await claimUsername(session.email, req.body.username, req.body.agree === true);
    if (result.error) return res.status(409).json({ error: result.error });
    res.setHeader('Set-Cookie', sessionCookie(createSession(result.account, process.env.SESSION_SECRET)));
    return res.status(200).json({ username: result.account.username });
  }

  if (req.body && typeof req.body.profile === 'object' && req.body.profile) {
    const account = await updateProfile(session.email, req.body.profile);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.status(200).json({ name: account.name, profile: account.profile });
  }

  if (typeof req.body?.notifications !== 'boolean') return res.status(400).json({ error: 'Invalid preference' });
  const account = await updateNotifications(session.email, req.body.notifications);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  return res.status(200).json({ notifications: account.notifications });
}
