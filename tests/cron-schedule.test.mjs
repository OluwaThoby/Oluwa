import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCronOccurrence } from '../src/lib/cron-schedule.mjs';

test('calculates the next weekday in Africa/Lagos', () => {
  const next = nextCronOccurrence('0 9 * * 1-5', 'Africa/Lagos', new Date('2026-11-11T12:00:00.000Z'));
  assert.equal(next.toISOString(), '2026-11-12T08:00:00.000Z');
});

test('skips nonexistent local times during the spring daylight-saving transition', () => {
  const next = nextCronOccurrence('30 2 * * *', 'America/New_York', new Date('2026-03-07T12:00:00.000Z'));
  assert.equal(next.toISOString(), '2026-03-09T06:30:00.000Z');
});

test('handles the repeated local hour during the autumn daylight-saving transition', () => {
  const next = nextCronOccurrence('30 1 * * *', 'America/New_York', new Date('2026-11-01T05:45:00.000Z'));
  assert.equal(next.toISOString(), '2026-11-01T06:30:00.000Z');
});

test('uses standard cron OR semantics when both day fields are restricted', () => {
  const next = nextCronOccurrence('0 0 1 * 1', 'UTC', new Date('2026-11-02T00:01:00.000Z'));
  assert.equal(next.toISOString(), '2026-11-09T00:00:00.000Z');
});

test('rejects invalid expressions, timezones and impossible calendar schedules', () => {
  assert.throws(() => nextCronOccurrence('not cron', 'UTC'), /Invalid five-field/);
  assert.throws(() => nextCronOccurrence('* * * * *', 'Not/A_Timezone'), /time zone|timezone/i);
  assert.throws(
    () => nextCronOccurrence('0 0 31 2 *', 'UTC', new Date('2026-01-01T00:00:00.000Z')),
    /366 days/,
  );
});
