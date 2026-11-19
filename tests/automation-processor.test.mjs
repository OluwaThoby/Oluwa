import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutomationRequest, processAutomationRun, verifyAutomationOutput } from '../src/lib/intelligence/automation-processor.mjs';

test('processor builds evidence-bounded internal task requests', () => {
  const request = buildAutomationRequest({
    jobType: 'prospect_research',
    title: 'Research Example Ltd',
    config: { instructions: 'Assess fit', prospect_id: 'p-1' },
    input: { source: 'owner supplied' },
    evidence: { business_name: 'Example Ltd', website_status: 'unknown' },
  });
  assert.match(request.system, /Never send messages/i);
  assert.match(request.system, /Never fabricate facts/i);
  assert.match(request.system, /evidence-led prospect research brief/i);
  assert.match(request.prompt, /Example Ltd/);
  assert.match(request.prompt, /verified workspace evidence/i);
});

test('SEO monitoring analyses supplied audit evidence without claiming a new crawl', () => {
  const request = buildAutomationRequest({
    jobType: 'seo_monitoring',
    title: 'Review latest audit',
    evidence: { overall_score: 72, findings: [{ key: 'title', severity: 'high' }] },
  });
  assert.match(request.system, /Do not claim to have crawled or re-audited/i);
});

test('follow-up and invoice workflows are draft-only', () => {
  for (const jobType of ['client_followup', 'invoice_reminder']) {
    const request = buildAutomationRequest({ jobType, title: 'Prepare draft' });
    assert.match(request.system, /Do not send, schedule, or contact anyone|Do not send, charge/i);
    assert.match(request.system, /Never send messages/i);
  }
});

test('unsupported job types, missing titles and oversized input fail closed', () => {
  assert.throws(() => buildAutomationRequest({ jobType: 'production_deploy', title: 'Deploy' }), /Unsupported/);
  assert.throws(() => buildAutomationRequest({ jobType: 'general', title: '' }), /title/);
  assert.throws(() => buildAutomationRequest({
    jobType: 'general', title: 'Large input', input: { blob: 'x'.repeat(17000) },
  }), /exceeds/);
});

test('output verification passes structured, evidence-aware responses', () => {
  const result = verifyAutomationOutput(
    'Outcome: suitable prospect. Evidence used: owner-provided website status. Assumptions: demand is unknown. Recommended next steps: verify the contact page and review the business website.',
  );
  assert.equal(result.status, 'passed');
  assert.equal(result.factualAccuracyVerified, false);
  assert.deepEqual(result.failedChecks, []);
});

test('output verification flags thin or risky output for owner review without deleting it', () => {
  const result = verifyAutomationOutput('I have successfully emailed the prospect.');
  assert.equal(result.status, 'needs_owner_review');
  assert.ok(result.failedChecks.includes('minimum_substance'));
  assert.ok(result.failedChecks.includes('external_action_claim'));
  assert.equal(result.checks.length, 5);
});

test('processor calls the configured generator and attaches verification metadata', async () => {
  let received;
  const result = await processAutomationRun({
    jobType: 'report_generation',
    title: 'Prepare report',
    evidence: { completed: ['audit'] },
    generate: async (request) => {
      received = request;
      return {
        text: 'Outcome: report draft prepared. Evidence used: supplied audit. Assumptions: none. Unknowns: current ranking. Recommended next steps: verify the ranking before sending to the client.',
        model: 'test/model',
        usage: { totalTokens: 12 },
      };
    },
  });
  assert.match(received.prompt, /Prepare report/);
  assert.match(result.output, /report draft/);
  assert.equal(result.model, 'test/model');
  assert.equal(result.executionBoundary, 'internal_only_no_external_actions');
  assert.equal(result.verification.status, 'passed');
});

test('processor rejects missing generator or empty model output', async () => {
  await assert.rejects(() => processAutomationRun({ jobType: 'general', title: 'No model' }), /runtime/);
  await assert.rejects(() => processAutomationRun({
    jobType: 'general', title: 'Empty output', generate: async () => ({ text: '  ' }),
  }), /no usable output/);
});
