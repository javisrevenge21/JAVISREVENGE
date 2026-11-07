import { deleteAccount, getAccount, PROFILE_OPTIONS } from '../../lib/accounts.js';
import { purgeMember, exportMember } from '../../lib/wall.js';
import { clearCookie, requireSameOrigin, sessionFromRequest, SESSION_COOKIE } from '../../lib/session.js';

export default async function handler(req, res) {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });

  if (req.method === 'GET' && req.query.export) {
    // "Download my data": everything stored about this person, as a file.
    const account = await getAccount(session.email);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const { lastPostAt, lastReplyAt, ...stored } = account;
    const wall = await exportMember(account.email, account.username);
    res.setHeader('Content-Disposition', 'attachment; filename="javisrevenge-my-data.json"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(JSON.stringify({ exportedAt: new Date().toISOString(), account: stored, wall }, null, 2));
  }

  if (req.method === 'GET') {
    const account = await getAccount(session.email);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.status(200).json({
      email: account.email,
      name: account.name,
      username: account.username || '',
      picture: account.picture,
      notifications: account.notifications === true,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt,
      providers: account.providers || ['google'],
      profile: account.profile || {},
      options: PROFILE_OPTIONS
    });
  }

  if (req.method === 'DELETE') {
    if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
    const account = await getAccount(session.email);
    await purgeMember(session.email, account?.username).catch(() => null);
    await deleteAccount(session.email);
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
    return res.status(200).json({ deleted: true });
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
