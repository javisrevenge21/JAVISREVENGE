import { listAccounts, getAccount, saveAccount, deleteAccount, banEmail, unbanEmail, listBans, scrubUsername } from '../../lib/accounts.js';
import { purgeMember } from '../../lib/wall.js';
import { recentLog, hasAI } from '../../lib/moderation.js';
import { countWaitlist } from '../../lib/waitlist.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../../lib/session.js';

// GET  -> every member (with email + username) and the ban list
// POST { action: 'remove', email }  delete account, free the username, delete their Wall posts
// POST { action: 'ban', email, reason } remove + block that email from ever signing in again
// POST { action: 'unban', email }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = sessionFromRequest(req);
  if (!isAdmin(session)) return res.status(403).json({ error: 'Admin access required' });

  if (req.method === 'GET') {
    const users = (await listAccounts()).map(account => ({
      email: account.email,
      name: account.name,
      username: account.username || '',
      providers: account.providers || ['google'],
      notifications: account.notifications === true,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt,
      strikes: account.strikes || 0,
      mediaAccess: account.mediaAccess || 'none',
      mediaRequestedAt: account.mediaRequestedAt || null,
      followers: (account.followers || []).length
    }));
    const bans = await listBans().catch(() => []);
    const waitlistCount = await countWaitlist().catch(() => null);
    const modlog = await recentLog(60).catch(() => []);
    return res.status(200).json({ users, bans, modlog, aiModeration: hasAI(), waitlistCount, me: session.email.toLowerCase() });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  const action = req.body?.action;
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email.includes('@')) return res.status(400).json({ error: 'Email is required' });
  if (email === session.email.toLowerCase() && action !== 'unban') return res.status(400).json({ error: "You can't remove or ban yourself" });

  if (action === 'unban') { await unbanEmail(email); return res.status(200).json({ unbanned: email }); }
  // Photo/video permission: grant, deny (clears a request) or revoke.
  if (action === 'media') {
    const account = await getAccount(email);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const v = req.body?.value;
    account.mediaAccess = v === 'grant' ? 'granted' : v === 'deny' ? 'denied' : 'none';
    account.mediaDecidedAt = new Date().toISOString();
    account.inbox = [{ type: 'media', granted: v === 'grant', at: account.mediaDecidedAt, read: false }, ...(account.inbox || [])].slice(0, 60);
    await saveAccount(account);
    return res.status(200).json({ email, mediaAccess: account.mediaAccess });
  }
  if (action !== 'remove' && action !== 'ban') return res.status(400).json({ error: 'Unknown action' });

  const account = await getAccount(email);
  const purged = await purgeMember(email, account?.username).catch(() => ({ posts: 0 }));
  const posts = purged.posts;
  if (account) { await deleteAccount(email); await scrubUsername(account.username).catch(() => {}); }
  if (action === 'ban') {
    await banEmail(email, { username: account?.username || '', name: account?.name || '', reason: String(req.body?.reason || '').slice(0, 200), by: session.email });
  }
  return res.status(200).json({ done: action, email, postsDeleted: posts, hadAccount: !!account });
}
