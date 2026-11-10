import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequestedActions, evaluateExecutionGrant } from '../src/lib/intelligence/execution-policy.mjs';

test('ordinary analysis does not require external-action approval or grant execution', () => {
  const result = classifyRequestedActions('Research five local businesses and audit their public websites.');
  assert.deepEqual(result.permissions, []);
  assert.equal(result.requiresExplicitApproval, false);
  assert.equal(result.executionGranted, false);
});

test('external actions are identified for scoped approval', () => {
  const result = classifyRequestedActions('Research prospects, send email outreach, then publish the approved article.');
  assert.deepEqual(result.permissions.sort(), ['content_publish', 'external_message']);
  assert.equal(result.requiresExplicitApproval, true);
  assert.equal(result.executionGranted, false);
});

test('financial actions are critical and separately restricted', () => {
  const result = classifyRequestedActions('Pay the hosting invoice and purchase a subscription.');
  assert.equal(result.highestRisk, 'critical');
  assert.equal(result.financialApprovalRequired, true);
});

const now = new Date('2026-11-10T00:00:00.000Z');
const validGrant = {
  status: 'active',
  permissions: ['production_deploy'],
  scope: 'Approved project release',
  startsAt: '2026-11-09T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  maxUses: 1,
  uses: 0,
  agentKey: 'development',
  clientId: 'client-1',
  projectId: 'project-1',
  environment: 'production',
  resourceRef: 'project-1',
};

test('valid scoped non-financial grant passes validation', () => {
  const result = evaluateExecutionGrant({
    permission: 'production_deploy',
    grant: validGrant,
    now,
    expected: {
      agentKey: 'development',
      clientId: 'client-1',
      projectId: 'project-1',
      environment: 'production',
      resourceRef: 'project-1',
    },
  });
  assert.equal(result.allowed, true);
});

test('inactive, future, expired, revoked and exhausted grants are denied', () => {
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...validGrant, status: 'revoked' }, now }).reason, 'grant_not_active');
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...validGrant, revokedAt: '2026-11-09T00:00:00Z' }, now }).reason, 'grant_revoked');
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...validGrant, startsAt: '2026-11-11T00:00:00Z' }, now }).reason, 'grant_not_started');
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...validGrant, expiresAt: '2026-01-01T00:00:00Z' }, now }).reason, 'grant_expired_or_invalid');
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...validGrant, uses: 1 }, now }).reason, 'grant_use_limit_reached');
});

test('grant must match the requested agent, client, project, environment and resource', () => {
  const expected = { agentKey: 'development', clientId: 'client-1', projectId: 'project-1', environment: 'production', resourceRef: 'project-1' };
  for (const [key, value] of Object.entries({
    agentKey: 'sales',
    clientId: 'client-2',
    projectId: 'project-2',
    environment: 'preview',
    resourceRef: 'another-project',
  })) {
    const result = evaluateExecutionGrant({
      permission: 'production_deploy',
      grant: validGrant,
      now,
      expected: { ...expected, [key]: value },
    });
    assert.equal(result.allowed, false, `expected ${key} mismatch to be denied`);
  }
});

test('financial actions remain blocked even when named in a malformed legacy grant', () => {
  const result = evaluateExecutionGrant({
    permission: 'financial_action',
    grant: { ...validGrant, permissions: ['financial_action'] },
    now,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'financial_actions_require_separate_transaction_approval');
});

test('persisted database grant rows normalize into the canonical policy shape', async () => {
  const { normalizeExecutionGrant } = await import('../src/lib/intelligence/execution-policy.mjs');
  const row = {
    id: 'grant-1',
    status: 'active',
    permissions: ['production_deploy'],
    resource_scope: 'Approved project release',
    starts_at: '2026-11-09T00:00:00.000Z',
    expires_at: '2027-01-01T00:00:00.000Z',
    revoked_at: null,
    max_uses: 3,
    uses_count: 1,
    agent_key: 'development',
    client_id: 'client-1',
    project_id: 'project-1',
    environment: 'production',
  };
  const normalized = normalizeExecutionGrant(row);
  assert.equal(normalized.agentKey, 'development');
  assert.equal(normalized.uses, 1);
  assert.equal(normalized.scope, 'Approved project release');
  assert.equal(normalized.resourceRef, undefined, 'the current grant schema does not persist a resource_ref column');
  assert.equal(evaluateExecutionGrant({
    permission: 'production_deploy',
    grant: normalized,
    now,
    expected: { agentKey: 'development', clientId: 'client-1', projectId: 'project-1', environment: 'production' },
  }).allowed, true);
});

test('malformed persisted grant rows fail closed', async () => {
  const { normalizeExecutionGrant } = await import('../src/lib/intelligence/execution-policy.mjs');
  assert.equal(normalizeExecutionGrant(null), null);
  assert.equal(normalizeExecutionGrant({ permissions: ['production_deploy'] }), null);
  assert.equal(normalizeExecutionGrant({ status: 'active', permissions: ['production_deploy', 7], resource_scope: 'scope', agent_key: 'development', environment: 'production' }), null);
});
