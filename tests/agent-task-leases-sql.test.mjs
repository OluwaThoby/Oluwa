import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('database/migrations/20261111_add_agent_task_leases.sql', 'utf8');
const worker = readFileSync('src/app/api/worker/route.ts', 'utf8');

test('agent task lease migration extends the existing task schema safely', () => {
  for (const field of [
    'agent_tasks', 'attempt_count', 'max_attempts', 'lease_owner',
    'lease_token', 'lease_expires_at', 'agent_task_events',
  ]) assert.ok(sql.includes(field), 'Missing agent task lease reference: ' + field);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3/i);
  assert.match(sql, /max_attempts BETWEEN 1 AND 10/i);
});

test('agent worker claims only queued tasks that do not require approval', () => {
  for (const contract of [
    'SECURITY INVOKER',
    'FOR UPDATE SKIP LOCKED',
    "status = 'queued'",
    'requires_approval = false',
    'attempt_count < max_attempts',
    'lease_owner = p_worker_id',
    'lease_token = gen_random_uuid()',
    'lease_expires_at = now() + make_interval(secs => p_lease_seconds)',
    'REVOKE ALL ON FUNCTION public.claim_agent_tasks',
    'FROM PUBLIC',
  ]) assert.ok(sql.includes(contract), 'Missing safe agent claim contract: ' + contract);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
});

test('agent task completion rejects stale leases and records bounded retries', () => {
  for (const contract of [
    'p_lease_token uuid',
    "p_status NOT IN ('succeeded', 'failed')",
    "t.status = 'running'",
    't.requires_approval = false',
    't.lease_token = p_lease_token',
    't.lease_expires_at > now()',
    "WHEN p_status = 'failed' AND t.attempt_count < t.max_attempts THEN 'queued'",
    'RETURNING t.status, t.attempt_count INTO resulting_status, resulting_attempt',
    'worker_task_succeeded',
    'worker_task_attempt_failed',
    'REVOKE ALL ON FUNCTION public.complete_agent_task',
    'FROM PUBLIC',
  ]) assert.ok(sql.includes(contract), 'Missing safe agent completion contract: ' + contract);
  assert.match(sql, /octet_length\(p_output::text\) > 65536/i);
  assert.match(sql, /length\(p_error_message\) > 2000/i);
});

test('worker checks both lease migrations before claiming and processes agent tasks internally', () => {
  for (const contract of [
    'claim_agent_tasks',
    'complete_agent_task',
    'claim_automation_runs',
    'complete_automation_run',
    'requires_approval',
    'externalActionsEnabled: false',
  ]) assert.ok(worker.includes(contract), 'Worker is missing integration contract: ' + contract);
});
