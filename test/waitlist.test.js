import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, normalizeEmail } from '../lib/waitlist.js';

test('normalizes waitlist emails', () => {
  assert.equal(normalizeEmail('  Fan@Example.COM '), 'fan@example.com');
  assert.equal(normalizeEmail(undefined), '');
});

test('validates waitlist emails', () => {
  assert.ok(isValidEmail('fan@example.com'));
  assert.ok(isValidEmail('first.last+pt2@mail.example.co'));
  for (const bad of ['', 'fan', 'fan@', '@example.com', 'fan@example', 'a b@example.com', 'x@y.c', '<x>@example.com', 'a'.repeat(250) + '@example.com']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});
