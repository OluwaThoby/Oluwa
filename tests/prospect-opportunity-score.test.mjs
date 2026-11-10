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

test('a real limited-scope audit drives score from observed audit quality', () => {
  const result = scoreProspectOpportunity({
    website_status: 'active',
    audit_score: 52,
    audit_findings: [
      { key: 'title', severity: 'high' },
      { key: 'viewport', severity: 'high' },
      { key: 'meta', severity: 'medium' },
      { key: 'canonical', severity: 'low' },
      { key: 'https', severity: 'pass' },
    ],
  });
  assert.equal(result.score, 41);
  assert.equal(result.band, 'medium');
  assert.deepEqual(result.reasons, ['2_high_severity_audit_gaps', '1_medium_severity_audit_gaps', '1_low_severity_audit_gaps']);
  assert.equal(result.confidence, 'verified_limited_scope');
});

test('audit score is capped and malformed audit evidence is ignored', () => {
  assert.equal(scoreProspectOpportunity({ website_status: 'active', audit_score: 0, audit_findings: [{ severity: 'high' }] }).score, 85);
  assert.equal(scoreProspectOpportunity({ website_status: 'active', audit_score: 101, audit_findings: [{ severity: 'high' }] }).score, 8);
});
