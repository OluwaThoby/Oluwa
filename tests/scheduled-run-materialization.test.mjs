import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materializeDueSchedules } from '../src/lib/intelligence/materialize-schedules.mjs';

const migration = readFileSync('database/migrations/20261111_add_scheduled_run_materialization.sql', 'utf8');
const worker = readFileSync('src/app/api/worker/route.ts', 'utf8');
const schedulerWorkflow = readFileSync('.github/workflows/agencyos-scheduler.yml', 'utf8');

function fakeDb(responses) {
  const calls = [];
  const db = async (strings, ...values) => {
    calls.push({ sql: strings.join('?'), values });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response ?? [];
  };
  return { db, calls };
}

test('schedule materialization is idempotent and serialized per workflow', () => {
  for (const contract of [
    'scheduled_for timestamptz',
    'UNIQUE INDEX IF NOT EXISTS automation_runs_job_scheduled_for_uidx',
    'FOR UPDATE',
    "job_row.status <> 'active'",
    'job_row.next_run_at IS DISTINCT FROM p_expected_due_at',
    'ON CONFLICT (job_id, scheduled_for)',
    'next_run_at = p_next_run_at',
    'SECURITY INVOKER',
    'REVOKE ALL ON FUNCTION public.materialize_scheduled_automation_run',
    'FROM PUBLIC',
  ]) assert.ok(migration.includes(contract), 'Missing scheduler SQL contract: ' + contract);
  assert.doesNotMatch(migration, /SECURITY DEFINER/i);
});

test('worker materializes due schedules before it claims runs', () => {
  const materializeAt = worker.indexOf('materializeDueSchedules(db, new Date(), 10)');
  const claimAt = worker.indexOf('SELECT * FROM public.claim_agent_tasks(');
  assert.ok(materializeAt >= 0 && claimAt > materializeAt);
  assert.ok(worker.includes('schedule_materializer_ready'));
});

test('due schedule is materialized once with the next timezone-aware occurrence', async () => {
  const dueAt = '2026-11-11T12:00:00.000Z';
  const { db, calls } = fakeDb([
    [{
      id: '11111111-1111-4111-8111-111111111111',
      schedule_cron: '0 9 * * 1-5',
      timezone: 'Africa/Lagos',
      next_run_at: dueAt,
    }],
    [{ run_id: '22222222-2222-4222-8222-222222222222' }],
  ]);
  const result = await materializeDueSchedules(db, new Date(dueAt), 10);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.materialized, [{
    jobId: '11111111-1111-4111-8111-111111111111',
    runId: '22222222-2222-4222-8222-222222222222',
  }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].values[1], dueAt);
  assert.equal(calls[1].values[2], '2026-11-12T08:00:00.000Z');
});

test('a malformed due workflow does not prevent other schedules from being processed', async () => {
  const { db } = fakeDb([
    [
      { id: 'bad', schedule_cron: 'bad', timezone: 'UTC', next_run_at: '2026-11-11T12:00:00.000Z' },
      { id: 'good', schedule_cron: '0 9 * * *', timezone: 'Africa/Lagos', next_run_at: '2026-11-11T12:00:00.000Z' },
    ],
    [{ run_id: '33333333-3333-4333-8333-333333333333' }],
  ]);
  const result = await materializeDueSchedules(db, new Date('2026-11-11T12:00:00.000Z'), 10);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.materialized[0], { jobId: 'bad', error: 'schedule_materialization_failed' });
  assert.equal(result.materialized[1].runId, '33333333-3333-4333-8333-333333333333');
});

test('five-minute scheduler trigger requires both HTTPS worker URL and secret', () => {
  assert.match(schedulerWorkflow, /cron: ".*\/5 \* \* \* \*"/);
  assert.ok(schedulerWorkflow.includes('AGENCYOS_WORKER_URL'));
  assert.ok(schedulerWorkflow.includes('CRON_SECRET'));
  assert.ok(schedulerWorkflow.includes('https://*'));
  assert.ok(schedulerWorkflow.includes('/api/worker'));
});
