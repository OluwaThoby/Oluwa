import test from 'node:test';
import assert from 'node:assert/strict';
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
