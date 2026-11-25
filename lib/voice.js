// "Ask Ryan": an AI that answers members' questions out loud, in a voice modeled on Ryan's.
//
// Answers:  Vercel AI Gateway (AI_GATEWAY_API_KEY, or the project's OIDC token on Vercel),
//           or OpenAI directly with the OPENAI_API_KEY the site already has for moderation.
// Voice:    the same cloned-voice server as ryanjavaheri.com (Chatterbox on Modal, see
//           voice-agent/tts_modal.py in the Ryan-Javaheri repo). Set TTS_URL (its "speak"
//           endpoint) and TTS_TOKEN in Vercel. Until then the browser reads answers aloud
//           with its own voice.
// Limits:   members without REVENGE+ get FREE_QUESTIONS questions, counted on their account
//           (so a refresh, a new tab or another device doesn't reset it). REVENGE+ members
//           and the owner have no limit.

import { isPlus } from './billing.js';

export const FREE_QUESTIONS = () => Math.max(0, parseInt(process.env.VOICE_FREE_QUESTIONS ?? '1', 10) || 0);
export const MIN_GAP_MS = 3000; // one question every 3 seconds at most, for anyone
export const MAX_QUESTION = 500;
export const MAX_TTS_CHARS = 600; // the voice server reads at most this much

export const SYSTEM_PROMPT = `You are Ryan Javi's AI, the voice assistant on JAVISREVENGE (javisrevenge.com). Members hear your answers out loud in an AI voice modeled on Ryan's, so talk the way Ryan would: casual, direct, confident, a little funny, from Los Angeles. Speak for Ryan in first person ("I", "my site") when talking about the site and what he does, but you are an AI: if anyone asks, say you're Ryan's AI and never claim to be a human or to be Ryan himself.

How to answer:
- Short and spoken: two to four sentences, under about 70 words. No lists, no markdown, no emoji, no links read out letter by letter (say "contact at javisrevenge dot com").
- Answer only from the facts below and general knowledge. If you don't know something about Ryan, say you don't know and point them to contact@javisrevenge.com. Never make up plans, dates, prices, drops or personal details.
- Never share private information about Ryan or anyone else: where he lives, his schedule, family, phone numbers, or what is in the private archives.
- Never promise anything for Ryan (collabs, replies, deals, meetups). Say they can email contact@javisrevenge.com.
- Politics: share the views the site itself states (below), respectfully. No insults, no calls for violence or harassment of anyone.
- Refuse anything illegal, hateful, sexual, or harmful, briefly.

FACTS ABOUT JAVISREVENGE
- JAVISREVENGE is the brand and home base of Ryan Javi, a Los Angeles creator building a community on his own terms. It started as a name and grew into a full platform, built independently: no algorithm decides what you see, no big platform owns the conversation, members' privacy comes first.
- The site is members-only: sign in with Google, pick a username, and you're in. Profiles only show once you post, nobody can browse a member list, reactions and poll votes are anonymous.
- The Revenge Wall ("Break the walls down. No limits."): the members-only social feed. Post, reply, react, run polls, follow people, save posts. Open space, say what you think. A few words are banned site-wide, no photos or videos of the owner, photos and videos are for approved members (request access from the picture button), nothing illegal. Report with the three dots menu. Anonymous tips go to a private inbox only the owner reads.
- REVENGE+: the membership that keeps the site independent. Perks: a ✦ badge next to your name, no ads, longer posts (up to 1,000 characters, 600 per reply), exclusive Obsidian and Cyber profile themes, and unlimited questions with me, Ryan's AI. Monthly, cancel anytime, billed by Stripe. Join from the REVENGE+ tab on the Revenge Wall.
- Without REVENGE+, members get one free question with me.
- Politics: daily coverage from @officialcaliconservative. A conservative voice from the heart of Los Angeles. G-d and America first. Free speech, strong borders, safe streets, lower costs, and a government that answers to the people. Covers LA City Hall, Sacramento, Washington and world affairs; stands with the people of Iran (#FreeIran). Daily posts, clips and animations; shows up at rallies and sometimes organizes them.
- Archives: private, by request, since 2016 (@javiarchives.jp on Instagram, request access there). Not everything there is filmed by or about Ryan; reposting or leaking breaks the rules.
- Shop: merch and drops, coming soon.
- The app: install JAVISREVENGE on your phone from the profile menu, "Get the app".
- Contact: contact@javisrevenge.com for questions, tips and business. Socials: X @javisrevenge, Instagram @javisrevenge21.`;

// Who can ask, and how many they have left. `admin` is the site owner.
export function allowance(account, admin = false, now = Date.now()) {
  const used = Math.max(0, (account && account.voiceChat && account.voiceChat.used) || 0);
  const unlimited = !!admin || isPlus(account);
  const free = FREE_QUESTIONS();
  const left = unlimited ? null : Math.max(0, free - used);
  const last = Date.parse((account && account.voiceChat && account.voiceChat.lastAt) || 0) || 0;
  return { unlimited, used, free, left, canAsk: unlimited || left > 0, tooSoon: now - last < MIN_GAP_MS };
}

// Clean what the browser sends. Free members get no history: one question, one answer.
export function cleanMessages(input, unlimited) {
  const list = (Array.isArray(input) ? input : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_QUESTION) }));
  const kept = unlimited ? list.slice(-10) : list.slice(-1);
  return kept.length && kept[kept.length - 1].role === 'user' ? kept : [];
}

// On Vercel, functions get a short-lived OIDC token in the x-vercel-oidc-token header,
// which the AI Gateway accepts without any key. If the gateway refuses (for example, no
// credits), the OpenAI key is tried next.
function aiEndpoints(oidc = '') {
  const list = [];
  const gateway = process.env.AI_GATEWAY_API_KEY || oidc || process.env.VERCEL_OIDC_TOKEN;
  if (gateway) list.push({ url: 'https://ai-gateway.vercel.sh/v1/chat/completions', key: gateway, model: process.env.VOICE_AI_MODEL || 'openai/gpt-4.1-mini' });
  if (process.env.OPENAI_API_KEY) list.push({ url: 'https://api.openai.com/v1/chat/completions', key: process.env.OPENAI_API_KEY, model: (process.env.VOICE_AI_MODEL || 'gpt-4.1-mini').replace(/^openai\//, '') });
  return list;
}

export function aiConfigured(oidc = '') { return aiEndpoints(oidc).length > 0; }

async function ask(ai, messages, username) {
  const r = await fetch(ai.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ai.model,
      max_tokens: 220,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + (username ? `\n\nYou're talking with the member @${username}.` : '') },
        ...messages
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || `AI error ${r.status}`);
  const text = String(d.choices?.[0]?.message?.content || '').replace(/[*_#`]/g, '').trim();
  if (!text) throw new Error('Empty answer');
  return text;
}

export async function answer(messages, { username = '', oidc = '' } = {}) {
  const list = aiEndpoints(oidc);
  if (!list.length) throw new Error('not-configured');
  let err;
  for (const ai of list) {
    try { return await ask(ai, messages, username); }
    catch (e) { err = e; console.warn('voice chat AI failed:', ai.url, e?.message?.slice(0, 160)); }
  }
  throw err;
}

export function voiceConfigured() { return !!(process.env.TTS_URL && process.env.TTS_TOKEN); }

// Wrap raw 16-bit mono PCM in a WAV header so any browser can play it.
export function pcmToWav(pcm, sampleRate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Ryan's cloned voice for one answer. Returns a WAV data URL, or null if the voice
// server isn't set up or doesn't answer (the browser then uses its own voice).
// Only the AI's own answers are ever sent here, never text a visitor typed, so the
// voice can't be made to say arbitrary things.
export async function speak(text) {
  if (!voiceConfigured() || !text) return null;
  try {
    const r = await fetch(process.env.TTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TTS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, MAX_TTS_CHARS) }),
      signal: AbortSignal.timeout(45000)
    });
    if (!r.ok) throw new Error(`voice server ${r.status}`);
    const pcm = Buffer.from(await r.arrayBuffer());
    if (!pcm.length) return null;
    const rate = parseInt(r.headers.get('x-sample-rate') || '24000', 10) || 24000;
    return 'data:audio/wav;base64,' + pcmToWav(pcm, rate).toString('base64');
  } catch (e) {
    console.warn('voice failed, browser voice used instead:', e?.message);
    return null;
  }
}

// Wake the voice server's GPU when someone opens the chat, so the first answer is quicker.
export async function warmVoice() {
  if (!voiceConfigured() || !process.env.TTS_WARM_URL) return;
  try { await fetch(process.env.TTS_WARM_URL, { signal: AbortSignal.timeout(3000) }); } catch {}
}
