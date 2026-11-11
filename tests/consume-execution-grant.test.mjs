import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeExecutionGrant, validateGrantConsumption } from '../src/lib/intelligence/consume-execution-grant.mjs';

const valid = {
  grantId: '11111111-1111-4111-8111-111111111111',
  permission: 'production_deploy',
  agentKey: 'development',
  clientId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  environment: 'production',
  resourceRef: 'project:33333333-3333-4333-8333-333333333333',
  actionType: 'production_deploy',
  requestFingerprint: 'a'.repeat(64),
  idempotencyKey: '44444444-4444-4444-8444-444444444444',
};

test('valid consumption request passes strict input validation', () => {
  assert.deepEqual(validateGrantConsumption(valid), { valid: true, reason: 'valid_request' });
});

test('malformed identifiers, permission, environment and fingerprint fail closed', () => {
  for (const patch of [
    { grantId: 'not-a-uuid' },
    { permission: 'financial_action' },
    { environment: 'production-ish' },
    { requestFingerprint: 'short' },
    { resourceRef: ' ' },
    { actionType: 'x' },
  ]) {
    assert.equal(validateGrantConsumption({ ...valid, ...patch }).valid, false);
  }
});

test('invalid requests never call the database', async () => {
  let called = false;
  const result = await consumeExecutionGrant(async () => { called = true; return []; }, { ...valid, permission: 'financial_action' });
  assert.equal(called, false);
  assert.equal(result.consumed, false);
});

test('valid requests call the atomic database function with parameterized values', async () => {
  let captured;
  const fakeDb = async (strings, ...values) => {
    captured = { sql: strings.join('?'), values };
    return [{ result: {
      action_id: '55555555-5555-4555-8555-555555555555',
      grant_id: valid.grantId,
      status: 'requested',
      duplicate: false,
    } }];
  };
  const result = await consumeExecutionGrant(fakeDb, valid);
  assert.equal(result.consumed, true);
  assert.equal(result.duplicate, false);
  assert.equal(captured.values.length, 10);
  assert.ok(captured.sql.includes('public.consume_execution_grant'));
  assert.ok(!captured.sql.includes(valid.grantId), 'user values must remain parameterized');
});

test('idempotent database response is surfaced without a second local action', async () => {
  const fakeDb = async () => [{ result: {
    action_id: '55555555-5555-4555-8555-555555555555',
    grant_id: valid.grantId,
    status: 'requested',
    duplicate: true,
  } }];
  const result = await consumeExecutionGrant(fakeDb, valid);
  assert.equal(result.consumed, true);
  assert.equal(result.duplicate, true);
});

test('database failures fail closed and never report execution success', async () => {
  const result = await consumeExecutionGrant(async () => { throw new Error('db unavailable'); }, valid);
  assert.deepEqual(result, { consumed: false, reason: 'grant_consumption_failed' });
});
