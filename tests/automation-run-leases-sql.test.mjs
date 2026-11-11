import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('database/migrations/20261111_add_automation_run_leases.sql', 'utf8');

test('automation run lease migration matches the existing run and job schema', () => {
  for (const field of [
    'automation_runs', 'automation_jobs', 'lease_owner', 'lease_token',
    'lease_expires_at', 'attempt_count', 'max_attempts', 'job_id',
    'status', 'created_at', 'started_at', 'finished_at', 'error_message',
  ]) assert.ok(sql.includes(field), 'Missing lease schema reference: ' + field);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS lease_owner text/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS lease_token uuid/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz/i);
});

test('worker claims are atomic, bounded, and safe against concurrent workers', () => {
  for (const contract of [
    'SECURITY INVOKER',
    'FOR UPDATE OF r SKIP LOCKED',
    "r.status = 'queued'",
    "j.status = 'active'",
    'r.attempt_count < j.max_attempts',
    'attempt_count = r.attempt_count + 1',
    'lease_owner = p_worker_id',
    'lease_token = gen_random_uuid()',
    'lease_expires_at = now() + make_interval(secs => p_lease_seconds)',
    'REVOKE ALL ON FUNCTION',
    'FROM PUBLIC',
  ]) assert.ok(sql.includes(contract), 'Missing worker safety contract: ' + contract);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
  assert.match(sql, /p_batch_size > 20/i);
  assert.match(sql, /p_lease_seconds > 900/i);
});

test('expired leases are retried only within the job attempt limit', () => {
  assert.match(sql, /r\.lease_expires_at <= now\(\)/i);
  assert.match(sql, /r\.attempt_count >= COALESCE\(j\.max_attempts, 3\)/i);
  assert.match(sql, /THEN 'failed'[\s\S]*ELSE 'queued'/i);
  assert.match(sql, /lease_token = NULL/i);
  assert.match(sql, /lease_expires_at = NULL/i);
});


test('run completion is guarded by the current, unexpired lease token', () => {
  for (const contract of [
    'complete_automation_run',
    'p_run_id uuid',
    'p_lease_token uuid',
    "p_status NOT IN ('succeeded', 'failed')",
    "status = 'running'",
    'lease_token = p_lease_token',
    'lease_expires_at > now()',
    'finished_at = CASE',
    'ELSE now()',
    'lease_token = NULL',
    'lease_expires_at = NULL',
    'RETURNING r.status INTO resulting_status',
    'RETURN resulting_status',
    "WHEN p_status = 'failed' AND r.attempt_count < j.max_attempts THEN 'queued'",
    'SECURITY INVOKER',
    'REVOKE ALL ON FUNCTION public.complete_automation_run',
    'FROM PUBLIC',
  ]) assert.ok(sql.includes(contract), 'Missing lease completion contract: ' + contract);
  assert.match(sql, /octet_length\(p_result::text\) > 65536/i);
  assert.match(sql, /length\(p_error_message\) > 2000/i);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
});
