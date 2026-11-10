import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderEvent, suppressionReasonForEvent } from '../src/lib/email/provider-events.mjs';

const base = {
  provider: 'mail_vendor',
  eventId: 'evt_123',
  eventType: 'delivered',
  recipient: 'Person@Example.com',
  occurredAt: '2026-11-10T12:00:00.000Z',
};

test('normalizes provider event and recipient', () => {
  const event = normalizeProviderEvent(base);
  assert.equal(event.provider, 'mail_vendor');
  assert.equal(event.recipient, 'person@example.com');
  assert.equal(event.eventType, 'delivered');
});

test('rejects unknown event types, invalid recipient and invalid message id', () => {
  assert.throws(() => normalizeProviderEvent({ ...base, eventType: 'opened' }), /unsupported_event_type/);
  assert.throws(() => normalizeProviderEvent({ ...base, recipient: 'bad' }), /invalid_recipient/);
  assert.throws(() => normalizeProviderEvent({ ...base, messageId: 'not-a-uuid' }), /invalid_message_id/);
});

test('maps hard bounces, complaints and unsubscribes to permanent suppression reasons', () => {
  assert.equal(suppressionReasonForEvent('hard_bounce'), 'hard_bounce');
  assert.equal(suppressionReasonForEvent('complaint'), 'spam_complaint');
  assert.equal(suppressionReasonForEvent('unsubscribed'), 'unsubscribe');
  assert.equal(suppressionReasonForEvent('soft_bounce'), null);
  assert.equal(suppressionReasonForEvent('delivered'), null);
});
