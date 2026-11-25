import test from 'node:test';
import assert from 'node:assert/strict';
import { allowance, cleanMessages, pcmToWav, MIN_GAP_MS } from '../lib/voice.js';

const future = new Date(Date.now() + 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

test('a member without REVENGE+ gets one free question', () => {
  assert.deepEqual([allowance({}).canAsk, allowance({}).left], [true, 1]);
  const used = allowance({ voiceChat: { used: 1 } });
  assert.equal(used.canAsk, false);
  assert.equal(used.left, 0);
});

test('REVENGE+ members, gifted members and the owner have no limit', () => {
  const paid = allowance({ plus: { status: 'active', periodEnd: future }, voiceChat: { used: 40 } });
  assert.equal(paid.canAsk, true);
  assert.equal(paid.unlimited, true);
  assert.equal(allowance({ plus: { comp: true }, voiceChat: { used: 9 } }).canAsk, true);
  assert.equal(allowance({ voiceChat: { used: 9 } }, true).canAsk, true);
});

test('a lapsed membership goes back to the free limit', () => {
  const lapsed = allowance({ plus: { status: 'canceled', periodEnd: past }, voiceChat: { used: 3 } });
  assert.equal(lapsed.unlimited, false);
  assert.equal(lapsed.canAsk, false);
});

test('questions sent too quickly are held back', () => {
  const now = Date.now();
  assert.equal(allowance({ voiceChat: { lastAt: new Date(now - 500).toISOString() } }, false, now).tooSoon, true);
  assert.equal(allowance({ voiceChat: { lastAt: new Date(now - MIN_GAP_MS - 1).toISOString() } }, false, now).tooSoon, false);
});

test('free members send only their latest question, members keep history', () => {
  const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'system', content: 'x' }, { role: 'user', content: 'what is revenge+?' }];
  assert.deepEqual(cleanMessages(msgs, false), [{ role: 'user', content: 'what is revenge+?' }]);
  assert.equal(cleanMessages(msgs, true).length, 3);
  assert.deepEqual(cleanMessages([{ role: 'assistant', content: 'yo' }], true), []);
  assert.equal(cleanMessages([{ role: 'user', content: 'a'.repeat(900) }], false)[0].content.length, 500);
});

test('wraps voice audio in a playable WAV header', () => {
  const wav = pcmToWav(Buffer.alloc(480), 24000);
  assert.equal(wav.length, 524);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 480);
});
