import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyEmailWebhookSignature } from '../src/lib/email/webhook-signature.mjs';

const secret = 'a-very-long-webhook-secret-that-is-at-least-32-characters';
const rawBody = '{"event":"delivered"}';
const timestamp = '1794312000';
const signature = createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest('hex');

test('accepts a valid timestamped HMAC signature', () => {
  assert.equal(verifyEmailWebhookSignature({ rawBody, timestamp, signature, secret, now: Number(timestamp) * 1000 }), true);
});

test('rejects altered body, stale timestamp and malformed signature', () => {
  const now = Number(timestamp) * 1000;
  assert.equal(verifyEmailWebhookSignature({ rawBody: rawBody + ' ', timestamp, signature, secret, now }), false);
  assert.equal(verifyEmailWebhookSignature({ rawBody, timestamp, signature, secret, now: now + 600_000 }), false);
  assert.equal(verifyEmailWebhookSignature({ rawBody, timestamp, signature: 'bad', secret, now }), false);
  assert.equal(verifyEmailWebhookSignature({ rawBody, timestamp, signature, secret: 'short', now }), false);
});
