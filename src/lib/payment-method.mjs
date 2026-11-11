const PAYMENT_METHODS = new Set([
  'bank_transfer',
  'cash',
  'card',
  'payment_link',
  'payoneer',
  'other',
]);

export function normalizePaymentMethod(value) {
  return typeof value === 'string' && PAYMENT_METHODS.has(value)
    ? value
    : null;
}
