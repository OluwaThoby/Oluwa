/**
 * Deterministic preflight for AgencyOS email side effects.
 * This is a safety gate, not a spam score, deliverability prediction, or sender.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function evaluateEmailSendReadiness(input = {}) {
  const reasons = [];
  const sender = input.sender ?? {};
  const recipient = input.recipient ?? {};
  const campaign = input.campaign ?? {};
  const content = input.content ?? {};

  if (sender.verified !== true) reasons.push('sender_identity_not_verified');
  for (const key of ['spf', 'dkim', 'dmarc']) {
    if (sender[key] !== 'pass') reasons.push(`${key}_not_verified`);
  }
  if (sender.aligned !== true) reasons.push('sender_domain_not_aligned');

  const address = typeof recipient.email === 'string' ? recipient.email.trim() : '';
  if (!EMAIL_RE.test(address)) reasons.push('recipient_address_invalid');
  if (recipient.eligible !== true) reasons.push('recipient_eligibility_not_confirmed');
  if (input.suppressed === true) reasons.push('recipient_suppressed');
  if (input.unsubscribeRequired === true && recipient.unsubscribeAvailable !== true) {
    reasons.push('unsubscribe_mechanism_missing');
  }

  if (content.approved !== true || typeof content.version !== 'string' || !content.version.trim()) {
    reasons.push('approved_content_version_missing');
  }
  if (input.executionGrantValid !== true) reasons.push('scoped_execution_grant_missing');
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim().length < 12) {
    reasons.push('idempotency_key_missing');
  }

  const dailyLimit = campaign.dailyLimit;
  const dailySent = campaign.dailySent;
  const hourlyLimit = campaign.hourlyLimit;
  const hourlySent = campaign.hourlySent;
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || !Number.isInteger(dailySent) || dailySent < 0 || dailySent >= dailyLimit) {
    reasons.push('daily_send_limit_missing_or_reached');
  }
  if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1 || !Number.isInteger(hourlySent) || hourlySent < 0 || hourlySent >= hourlyLimit) {
    reasons.push('hourly_send_limit_missing_or_reached');
  }

  return {
    ready: reasons.length === 0,
    reasons,
    inboxPlacementGuaranteed: false,
    providerSendAttempted: false,
  };
}
