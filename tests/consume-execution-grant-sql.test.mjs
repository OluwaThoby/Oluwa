import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authority = readFileSync('database/migrations/20261110_create_execution_authority.sql', 'utf8');
const atomic = readFileSync('database/migrations/20261111_add_atomic_execution_grant_consumption.sql', 'utf8');

test('atomic function references columns and status values defined by authority schema', () => {
  for (const column of [
    'agent_key', 'client_id', 'project_id', 'resource_scope', 'environment',
    'permissions', 'status', 'max_uses', 'uses_count', 'starts_at', 'expires_at',
    'revoked_at', 'updated_at', 'grant_id', 'action_type', 'resource_ref',
    'request_fingerprint', 'idempotency_key',
  ]) assert.ok(authority.includes(column), 'Missing schema column: ' + column);

  for (const reference of [
    'v_grant.agent_key', 'v_grant.client_id', 'v_grant.project_id',
    'v_grant.resource_scope', 'v_grant.environment', 'v_grant.permissions',
    'v_grant.status', 'v_grant.max_uses', 'v_grant.uses_count',
    'v_grant.starts_at', 'v_grant.expires_at', 'v_grant.revoked_at',
  ]) assert.ok(atomic.includes(reference), 'Missing function reference: ' + reference);

  for (const column of [
    'grant_id', 'agent_key', 'action_type', 'resource_ref',
    'request_fingerprint', 'idempotency_key', 'status',
  ]) assert.ok(atomic.includes(column), 'Missing audit column: ' + column);

  assert.ok(authority.includes("status IN ('active','revoked','expired','exhausted')"));
  assert.ok(authority.includes("status IN ('requested','executing','provider_accepted','succeeded','failed','rolled_back','blocked')"));
  assert.ok(authority.includes('idempotency_key uuid NOT NULL UNIQUE'));
});

test('grant consumption is transactional, scoped, bounded and idempotent', () => {
  for (const contract of [
    'FOR UPDATE',
    'uses_count = uses_count + 1',
    'v_grant.resource_scope = p_resource_ref',
    'v_grant.client_id IS NOT DISTINCT FROM p_client_id',
    'v_grant.project_id IS NOT DISTINCT FROM p_project_id',
    'v_grant.environment = p_environment',
    'v_grant.agent_key = p_agent_key',
    'p_permission = ANY(v_grant.permissions)',
    'REVOKE ALL ON FUNCTION',
    'FROM PUBLIC',
  ]) assert.ok(atomic.includes(contract), 'Missing SQL contract: ' + contract);
  assert.doesNotMatch(atomic, /SECURITY DEFINER/);

  // Both the initial duplicate lookup and the post-lock race recheck must
  // enforce the same authority scope before returning an existing action.
  const duplicateChecks = atomic.split("IF FOUND THEN").slice(1);
  assert.equal(duplicateChecks.length, 2, 'Expected initial and concurrent idempotency checks');
  for (const block of duplicateChecks) {
    const end = block.indexOf('END IF;');
    const check = block.slice(0, end);
    for (const contract of [
      'v_existing.grant_id = p_grant_id',
      'v_existing.agent_key = p_agent_key',
      'v_existing.action_type = p_action_type',
      'v_existing.resource_ref = p_resource_ref',
      'v_existing.request_fingerprint = p_request_fingerprint',
      'p_action_type = p_permission',
      'v_grant.agent_key = p_agent_key',
      'v_grant.client_id IS NOT DISTINCT FROM p_client_id',
      'v_grant.project_id IS NOT DISTINCT FROM p_project_id',
      'v_grant.environment = p_environment',
      'v_grant.resource_scope = p_resource_ref',
      'p_permission = ANY(v_grant.permissions)',
    ]) assert.ok(check.includes(contract), 'Duplicate retry missing scope check: ' + contract);
  }
});
