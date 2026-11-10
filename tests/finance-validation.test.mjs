import test from 'node:test';
import assert from 'node:assert/strict';
import { dateOnly, money } from '../src/lib/finance-validation.mjs';

test('money rounds to two decimal places', () => {
  assert.equal(money(12.345), 12.35);
  assert.equal(money('10.1'), 10.1);
});

test('money rejects negative and non-finite values', () => {
  assert.equal(Number.isNaN(money(-1)), true);
  assert.equal(Number.isNaN(money('not-money')), true);
  assert.equal(Number.isNaN(money(Infinity)), true);
});

test('dateOnly accepts a real ISO calendar date', () => {
  assert.equal(dateOnly('2026-11-10'), '2026-11-10');
  assert.equal(dateOnly('2024-02-29'), '2024-02-29');
});

test('dateOnly rejects malformed and impossible dates', () => {
  assert.equal(dateOnly('2026-02-29'), null);
  assert.equal(dateOnly('2026-13-01'), null);
  assert.equal(dateOnly('10-11-2026'), null);
  assert.equal(dateOnly(null), null);
});
