import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnsubscribeToken, hashUnsubscribeToken } from '../src/lib/email/unsubscribe-token.mjs';

test('creates a cryptographically random opaque token and stores only its hash', () => {
  const first = createUnsubscribeToken();
  const second = createUnsubscribeToken();
  assert.match(first.token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(hashUnsubscribeToken(first.token), first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
});

test('rejects malformed tokens without hashing them', () => {
  assert.equal(hashUnsubscribeToken(''), null);
  assert.equal(hashUnsubscribeToken('not-a-token'), null);
  assert.equal(hashUnsubscribeToken('a'.repeat(200)), null);
});
