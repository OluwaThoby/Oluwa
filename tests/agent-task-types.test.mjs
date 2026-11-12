import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAgentTaskType, SUPPORTED_AGENT_TASK_TYPES } from '../src/lib/intelligence/agent-task-types.mjs';

test('all supported internal agent task types are preserved', () => {
  for (const type of SUPPORTED_AGENT_TASK_TYPES) assert.equal(normalizeAgentTaskType(type), type);
});

test('prospect qualification is not downgraded to general analysis', () => {
  assert.equal(normalizeAgentTaskType('prospect_qualification'), 'prospect_qualification');
});

test('unknown and malformed task types fail safely to general', () => {
  assert.equal(normalizeAgentTaskType('external_payment'), 'general');
  assert.equal(normalizeAgentTaskType(null), 'general');
  assert.equal(normalizeAgentTaskType({}), 'general');
});


test('agent task creation and audit event are committed in one SQL statement', () => {
  const route = readFileSync('src/app/api/agent-tasks/route.ts', 'utf8');
  assert.match(route, /WITH created AS \(/);
  assert.match(route, /logged AS \(/);
  assert.match(route, /INSERT INTO public\.agent_task_events/);
  assert.match(route, /INNER JOIN logged ON logged\.task_id = created\.id/);
});


test('manual agent execution is protected by an expiring lease token', () => {
  const route = readFileSync('src/app/api/agent-tasks/[id]/execute/route.ts', 'utf8');
  assert.match(route, /lease_token = gen_random_uuid\(\)/);
  assert.match(route, /lease_expires_at = NOW\(\) \+ INTERVAL '180 seconds'/);
  assert.match(route, /AND lease_token = \$\{leaseToken\}::uuid/);
  assert.match(route, /AND lease_expires_at > NOW\(\)/);
  assert.match(route, /The execution lease expired or was replaced/);
});


test('orchestrator execution uses an expiring lease and atomic audit events', () => {
  const route = readFileSync('src/app/api/orchestrator/route.ts', 'utf8');
  assert.match(route, /lease_token, lease_expires_at/);
  assert.match(route, /gen_random_uuid\(\)/);
  assert.match(route, /lease_expires_at > NOW\(\)/);
  assert.match(route, /lease_expires_at = NOW\(\) \+ INTERVAL '180 seconds'/);
  assert.match(route, /WITH created AS \(/);
  assert.match(route, /WITH completed AS \(/);
  assert.match(route, /WITH failed AS \(/);
  assert.match(route, /FROM completed JOIN logged ON logged\\.task_id = completed\\.id/);
  assert.match(route, /FROM failed JOIN logged ON logged\\.task_id = failed\\.id/);
  assert.match(route, /execution lease expired or was replaced/);
});
