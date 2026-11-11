import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutomationRequest, processAutomationRun } from '../src/lib/intelligence/automation-processor.mjs';

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

test('processor calls the configured generator and returns internal-only output metadata', async () => {
  let received;
  const result = await processAutomationRun({
    jobType: 'report_generation',
    title: 'Prepare report',
    evidence: { completed: ['audit'] },
    generate: async (request) => {
      received = request;
      return { text: 'Report draft', model: 'test/model', usage: { totalTokens: 12 } };
    },
  });
  assert.match(received.prompt, /Prepare report/);
  assert.equal(result.output, 'Report draft');
  assert.equal(result.model, 'test/model');
  assert.equal(result.executionBoundary, 'internal_only_no_external_actions');
});

test('processor rejects missing generator or empty model output', async () => {
  await assert.rejects(() => processAutomationRun({ jobType: 'general', title: 'No model' }), /runtime/);
  await assert.rejects(() => processAutomationRun({
    jobType: 'general', title: 'Empty output', generate: async () => ({ text: '  ' }),
  }), /no usable output/);
});
