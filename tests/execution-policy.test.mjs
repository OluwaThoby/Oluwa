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

test('valid scoped non-financial grant passes validation', () => {
  const result = evaluateExecutionGrant({
    permission: 'production_deploy',
    grant: { permissions: ['production_deploy'], scope: 'Deploy project abc after release checks', expiresAt: '2027-01-01T00:00:00.000Z', maxUses: 1, uses: 0 },
    now: new Date('2026-11-10T00:00:00.000Z'),
  });
  assert.equal(result.allowed, true);
});

test('expired, revoked, exhausted and financial grants are denied', () => {
  const base = { permissions: ['production_deploy', 'financial_action'], scope: 'Approved project release', expiresAt: '2027-01-01T00:00:00.000Z', maxUses: 1, uses: 0 };
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...base, revokedAt: '2026-11-09T00:00:00Z' } }).allowed, false);
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...base, expiresAt: '2026-01-01T00:00:00Z' }, now: new Date('2026-11-10T00:00:00Z') }).allowed, false);
  assert.equal(evaluateExecutionGrant({ permission: 'production_deploy', grant: { ...base, uses: 1 } }).allowed, false);
  assert.equal(evaluateExecutionGrant({ permission: 'financial_action', grant: base }).allowed, false);
});
