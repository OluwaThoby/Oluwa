import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaymentMethod } from '../src/lib/payment-method.mjs';

test('accepts supported incoming payment methods including Payoneer', () => {
  for (const method of ['bank_transfer', 'cash', 'card', 'payment_link', 'payoneer', 'other']) {
    assert.equal(normalizePaymentMethod(method), method);
  }
});

test('rejects unknown, malformed and non-string payment methods', () => {
  for (const method of ['paypal', 'crypto', '', null, undefined, 42, {}]) {
    assert.equal(normalizePaymentMethod(method), null);
  }
});

test('does not infer Payoneer from arbitrary labels', () => {
  assert.equal(normalizePaymentMethod('Payoneer'), null);
  assert.equal(normalizePaymentMethod('payoneer_transfer'), null);
});
