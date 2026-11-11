import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authority = readFileSync('database/migrations/20261110_create_execution_authority.sql', 'utf8');
const atomic = readFileSync('database/migrations/20261111_add_atomic_execution_grant_consumption.sql', 'utf8');

test('atomic function references columns and status values defined by authority schema', () => {
  for (const column of [
    'agent_key', 'client_id', 'project_id', 'resource_scope', 'environment',
    'permissions', 'status', 'max_uses', 'uses_count', 'starts_at', 'expires_at',
    'revoked_at', 'updated_at',
  ]) {
    assert.match(authority, new RegExp('\\b' + column + '\\b'));
    assert.match(atomic, new RegExp('\\bv_grant\\.' + column + '\\b'));
  }
  for (const column of [
    'grant_id', 'agent_key', 'action_type', 'resource_ref',
    'request_fingerprint', 'idempotency_key', 'status',
  ]) {
    assert.match(authority, new RegExp('\\b' + column + '\\b'));
    assert.match(atomic, new RegExp('\\b' + column + '\\b'));
  }
  assert.match(authority, /status IN \\('active','revoked','expired','exhausted'\\)/);
  assert.match(authority, /status IN \\('requested','executing','provider_accepted','succeeded','failed','rolled_back','blocked'\\)/);
  assert.match(authority, /idempotency_key uuid NOT NULL UNIQUE/);
});

test('grant consumption is transactional, scoped, bounded and idempotent', () => {
  assert.match(atomic, /FOR UPDATE/);
  assert.match(atomic, /uses_count = uses_count \\+ 1/);
  assert.match(atomic, /v_grant\\.resource_scope = p_resource_ref/);
  assert.match(atomic, /v_grant\\.client_id IS NOT DISTINCT FROM p_client_id/);
  assert.match(atomic, /v_grant\\.project_id IS NOT DISTINCT FROM p_project_id/);
  assert.match(atomic, /v_grant\\.environment = p_environment/);
  assert.match(atomic, /v_grant\\.agent_key = p_agent_key/);
  assert.match(atomic, /p_permission = ANY\\(v_grant\\.permissions\\)/);
  assert.match(atomic, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
  assert.doesNotMatch(atomic, /SECURITY DEFINER/);
});
