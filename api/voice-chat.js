import { getAccount, isBanned, saveAccount } from '../lib/accounts.js';
import { refreshPlus } from '../lib/billing.js';
import { isAdmin, requireSameOrigin, sessionFromRequest } from '../lib/session.js';
import { aiConfigured, allowance, answer, cleanMessages, speak, voiceConfigured, warmVoice } from '../lib/voice.js';

// "Ask Ryan" voice chat.
//   GET  -> { left, unlimited, voice } for the signed-in member (and wakes the voice server)
//   POST { messages } -> { reply, audio, left, unlimited }
// Members without REVENGE+ get one question, counted on their account.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  const me = await getAccount(session.email);
  if (!me || !me.username || await isBanned(me.email)) return res.status(403).json({ error: 'Not allowed' });
  const admin = isAdmin(session);
  try { const fresh = await refreshPlus(me); if (fresh) { me.plus = fresh; await saveAccount(me); } } catch (e) {}
  const oidc = req.headers['x-vercel-oidc-token'] || '';

  if (req.method === 'GET') {
    const a = allowance(me, admin);
    if (a.canAsk) await warmVoice();
    return res.status(200).json({ left: a.left, unlimited: a.unlimited, free: a.free, on: aiConfigured(oidc), voice: voiceConfigured() });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return res.status(403).json({ error: 'Bad origin' });

  const a = allowance(me, admin);
  if (!a.canAsk) {
    return res.status(402).json({ error: 'limit', message: 'You used your free question. Join REVENGE+ for unlimited questions.', left: 0, unlimited: false });
  }
  if (a.tooSoon) return res.status(429).json({ error: 'Slow down a little and ask again.' });
  if (!aiConfigured(oidc)) return res.status(503).json({ error: 'Ask Ryan is not switched on yet.' });

  const messages = cleanMessages(req.body?.messages, a.unlimited);
  if (!messages.length) return res.status(400).json({ error: 'Ask a question first.' });

  // Count the question before answering, so two quick taps can't both use the free one.
  const before = me.voiceChat || {};
  me.voiceChat = { ...before, used: (before.used || 0) + 1, lastAt: new Date().toISOString() };
  await saveAccount(me);

  let reply;
  try {
    reply = await answer(messages, { username: me.username, oidc });
  } catch (e) {
    console.error('voice chat failed', e?.message);
    // Give the question back if we couldn't answer it.
    try {
      const fresh = await getAccount(me.email);
      if (fresh) { fresh.voiceChat = { ...(fresh.voiceChat || {}), used: Math.max(0, ((fresh.voiceChat && fresh.voiceChat.used) || 1) - 1), lastAt: before.lastAt || null }; await saveAccount(fresh); }
    } catch {}
    return res.status(502).json({ error: 'I couldn’t answer just now. Try again in a moment.' });
  }

  const audio = await speak(reply);
  const after = allowance(me, admin);
  return res.status(200).json({ reply, audio, left: after.left, unlimited: after.unlimited });
}
