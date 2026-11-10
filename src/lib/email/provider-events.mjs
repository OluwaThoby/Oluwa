const EVENT_TYPES = new Set([
  'accepted', 'delivered', 'deferred', 'hard_bounce',
  'soft_bounce', 'complaint', 'unsubscribed', 'rejected',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeProviderEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_event');
  const provider = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : '';
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  const eventType = typeof input.eventType === 'string' ? input.eventType.trim().toLowerCase() : '';
  const recipient = typeof input.recipient === 'string' ? input.recipient.trim().toLowerCase() : '';
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const messageId = input.messageId == null ? null : String(input.messageId);

  if (!/^[a-z0-9_-]{2,40}$/.test(provider)) throw new Error('invalid_provider');
  if (!eventId || eventId.length > 200) throw new Error('invalid_event_id');
  if (!EVENT_TYPES.has(eventType)) throw new Error('unsupported_event_type');
  if (!EMAIL_RE.test(recipient)) throw new Error('invalid_recipient');
  if (Number.isNaN(occurredAt.getTime())) throw new Error('invalid_occurred_at');
  if (messageId !== null && !UUID_RE.test(messageId)) throw new Error('invalid_message_id');

  return {
    provider,
    eventId,
    eventType,
    recipient,
    occurredAt: occurredAt.toISOString(),
    messageId,
    diagnosticCode: typeof input.diagnosticCode === 'string' ? input.diagnosticCode.slice(0, 160) : null,
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {},
  };
}

export function suppressionReasonForEvent(eventType) {
  if (eventType === 'hard_bounce') return 'hard_bounce';
  if (eventType === 'complaint') return 'spam_complaint';
  if (eventType === 'unsubscribed') return 'unsubscribe';
  return null;
}
