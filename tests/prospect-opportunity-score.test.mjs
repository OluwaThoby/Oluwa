import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreProspectOpportunity } from '../src/lib/intelligence/prospect-opportunity-score.mjs';

test('missing website is prioritised without rewarding contact completeness', () => {
  const sparse = scoreProspectOpportunity({ website_status: 'none' });
  const complete = scoreProspectOpportunity({ website_status: 'none', business_email: 'owner@example.com', phone: '+1 555 0100', city: 'Lagos', research_summary: 'Long notes' });
  assert.equal(sparse.score, 65);
  assert.equal(complete.score, sparse.score);
  assert.deepEqual(sparse.reasons, ['website_missing']);
  assert.equal(sparse.band, 'high');
});

test('reported outdated website ranks below no website', () => {
  assert.equal(scoreProspectOpportunity({ website_status: 'outdated' }).score, 50);
  assert.equal(scoreProspectOpportunity({ website_status: 'outdated' }).band, 'medium');
});

test('unknown and active statuses remain low priority and transparent', () => {
  const unknown = scoreProspectOpportunity({ website_status: 'unknown' });
  assert.equal(unknown.score, 15);
  assert.equal(unknown.confidence, 'low');
  assert.deepEqual(unknown.reasons, ['website_status_unverified']);
  assert.equal(scoreProspectOpportunity({ website_status: 'active' }).score, 8);
});

test('unknown or unexpected statuses fail conservatively', () => {
  const result = scoreProspectOpportunity({ website_status: 'guessed' });
  assert.equal(result.score, 15);
  assert.equal(result.basis, 'website_status_only');
});
