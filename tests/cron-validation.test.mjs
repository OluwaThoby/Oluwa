import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCron } from '../src/lib/cron-validation.mjs';

test('accepts common five-field cron schedules', () => {
  assert.equal(isValidCron('0 9 * * 1-5'), true);
  assert.equal(isValidCron('*/15 * * * *'), true);
  assert.equal(isValidCron('0 0 1,15 * *'), true);
  assert.equal(isValidCron('30 8-17/2 * 1-12 0,7'), true);
});

test('rejects invalid field counts and out-of-range values', () => {
  assert.equal(isValidCron('* * * *'), false);
  assert.equal(isValidCron('75 * * * *'), false);
  assert.equal(isValidCron('* 24 * * *'), false);
  assert.equal(isValidCron('* * 0 * *'), false);
  assert.equal(isValidCron('* * * 13 *'), false);
});

test('rejects malformed ranges and steps', () => {
  assert.equal(isValidCron('*/0 * * * *'), false);
  assert.equal(isValidCron('*/61 * * * *'), false);
  assert.equal(isValidCron('10-2 * * * *'), false);
  assert.equal(isValidCron('1,,2 * * * *'), false);
  assert.equal(isValidCron('* * * * * extra'), false);
  assert.equal(isValidCron(null), false);
});
