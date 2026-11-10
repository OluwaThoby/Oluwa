import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 300;

export function verifyEmailWebhookSignature({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (typeof rawBody !== 'string' || typeof timestamp !== 'string' ||
      typeof signature !== 'string' || typeof secret !== 'string' || secret.length < 32) return false;
  if (!/^\d{10}$/.test(timestamp)) return false;
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(Math.floor(now / 1000) - sentAt) > MAX_CLOCK_SKEW_SECONDS) return false;
  const supplied = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest();
  const actual = Buffer.from(supplied, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
