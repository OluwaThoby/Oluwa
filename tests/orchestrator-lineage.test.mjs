import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('orchestrator lineage endpoint is owner-only and validates the parent id', () => {
  const route = readFileSync('src/app/api/orchestrator/[id]/route.ts', 'utf8');
  assert.match(route, /async function isOwner\(\)/);
  assert.match(route, /if \(!\(await isOwner\(\)\)\)/);
  assert.match(route, /\^\[0-9a-f-\]\{36\}\$/i);
  assert.match(route, /WHERE id = \$\{id\}::uuid/);
});

test('orchestrator lineage returns child tasks, audit events and attention summary', () => {
  const route = readFileSync('src/app/api/orchestrator/[id]/route.ts', 'utf8');
  assert.match(route, /input->>'parent_task_id'/);
  assert.match(route, /FROM public\.agent_task_events/);
  assert.match(route, /requiresOwnerAttention/);
  assert.match(route, /byStatus: counts/);
  assert.match(route, /LIMIT 50/);
  assert.match(route, /LIMIT 200/);
});
