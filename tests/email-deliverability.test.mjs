import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEmailSendReadiness } from '../src/lib/email/deliverability-policy.mjs';

const valid = {
  sender: { verified: true, spf: 'pass', dkim: 'pass', dmarc: 'pass', aligned: true },
  recipient: { email: 'prospect@example.com', eligible: true, unsubscribeAvailable: true },
  campaign: { dailyLimit: 40, dailySent: 2, hourlyLimit: 10, hourlySent: 1 },
  content: { approved: true, version: 'sha256:approved-v1' },
  unsubscribeRequired: true,
  executionGrantValid: true,
  idempotencyKey: 'campaign-123-recipient-456',
};

test('allows a fully preflighted email without claiming inbox placement', () => {
  const result = evaluateEmailSendReadiness(valid);
  assert.equal(result.ready, true);
  assert.equal(result.inboxPlacementGuaranteed, false);
  assert.equal(result.providerSendAttempted, false);
});

test('blocks missing sender authentication and alignment', () => {
  const result = evaluateEmailSendReadiness({
    ...valid,
    sender: { ...valid.sender, dkim: 'fail', aligned: false },
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes('dkim_not_verified'));
  assert.ok(result.reasons.includes('sender_domain_not_aligned'));
});

test('blocks suppressed recipients and missing unsubscribe handling', () => {
  const result = evaluateEmailSendReadiness({
    ...valid,
    suppressed: true,
    recipient: { ...valid.recipient, unsubscribeAvailable: false },
  });
  assert.ok(result.reasons.includes('recipient_suppressed'));
  assert.ok(result.reasons.includes('unsubscribe_mechanism_missing'));
});

test('blocks unapproved content, missing grants and exhausted limits', () => {
  const result = evaluateEmailSendReadiness({
    ...valid,
    content: { approved: false },
    executionGrantValid: false,
    campaign: { dailyLimit: 10, dailySent: 10, hourlyLimit: 3, hourlySent: 3 },
  });
  assert.ok(result.reasons.includes('approved_content_version_missing'));
  assert.ok(result.reasons.includes('scoped_execution_grant_missing'));
  assert.ok(result.reasons.includes('daily_send_limit_missing_or_reached'));
  assert.ok(result.reasons.includes('hourly_send_limit_missing_or_reached'));
});

test('rejects malformed recipient and weak idempotency key', () => {
  const result = evaluateEmailSendReadiness({
    ...valid,
    recipient: { ...valid.recipient, email: 'not-an-email' },
    idempotencyKey: 'short',
  });
  assert.ok(result.reasons.includes('recipient_address_invalid'));
  assert.ok(result.reasons.includes('idempotency_key_missing'));
});
