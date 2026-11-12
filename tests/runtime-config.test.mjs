import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAgencyModelRuntimeReadiness, resolveAgencyProviderForTask } from '../src/lib/intelligence/runtime-config.mjs';

test('self-hosted runtime is ready only when endpoint, model and token are present', () => {
  const ready = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'self-hosted',
    AGENCY_MODEL_ENDPOINT: 'https://inference.example.com/v1/chat/completions',
    AGENCY_MODEL_NAME: 'agencyos-student-v1',
    AGENCY_MODEL_TOKEN: 'test-token',
  });
  assert.equal(ready.configured, true);
  assert.equal(ready.model, 'agencyos-student-v1');
  assert.deepEqual(ready.missing, []);
});

test('self-hosted runtime reports missing fields without exposing secret values', () => {
  const result = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'self-hosted',
    AGENCY_MODEL_ENDPOINT: 'https://inference.example.com/v1/chat/completions',
    AGENCY_MODEL_TOKEN: 'never-return-this-token',
  });
  assert.equal(result.configured, false);
  assert.deepEqual(result.missing, ['AGENCY_MODEL_NAME']);
  assert.equal(JSON.stringify(result).includes('never-return-this-token'), false);
});

test('gateway runtime requires an explicit model and a recognised credential', () => {
  assert.equal(getAgencyModelRuntimeReadiness({
    AI_GATEWAY_MODEL: 'provider/model',
  }).configured, false);
  assert.equal(getAgencyModelRuntimeReadiness({
    AI_GATEWAY_MODEL: 'provider/model',
    VERCEL_OIDC_TOKEN: 'test-token',
  }).configured, true);
  assert.equal(getAgencyModelRuntimeReadiness({
    AI_GATEWAY_MODEL: 'provider/model',
    AI_GATEWAY_API_KEY: 'test-key',
  }).configured, true);
});

test('unsupported runtime never falls back to a hosted model', () => {
  const result = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'unknown',
    AI_GATEWAY_MODEL: 'provider/model',
    VERCEL_OIDC_TOKEN: 'test-token',
  });
  assert.equal(result.configured, false);
  assert.equal(result.model, null);
});


test('multi-provider readiness honours task-specific routes instead of unused providers', () => {
  const result = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'multi-provider',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_MODEL: 'openrouter/free',
    GEMINI_API_KEY: 'unused-gemini-key',
    GEMINI_MODEL: 'unused-model',
    GROQ_API_KEY: 'unused-groq-key',
    GROQ_MODEL: 'unused-model',
    AGENCY_ROUTE_GENERAL: 'openrouter',
    AGENCY_ROUTE_PROSPECT_RESEARCH: 'openrouter',
    AGENCY_ROUTE_PROSPECT_QUALIFICATION: 'openrouter',
    AGENCY_ROUTE_SEO_MONITORING: 'openrouter',
    AGENCY_ROUTE_REPORT_GENERATION: 'openrouter',
    AGENCY_ROUTE_CLIENT_FOLLOWUP: 'openrouter',
    AGENCY_ROUTE_INVOICE_REMINDER: 'openrouter',
  });

  assert.equal(result.configured, true);
  assert.deepEqual(result.providers, ['openrouter']);
  assert.ok(Object.values(result.routes).every((provider) => provider === 'openrouter'));
  assert.deepEqual(result.missing, []);
  assert.equal(JSON.stringify(result).includes('test-openrouter-key'), false);
});

test('multi-provider readiness requires only credentials for providers actually selected', () => {
  const result = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'multi-provider',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'openrouter/free',
    AGENCY_ROUTE_GENERAL: 'openrouter',
    AGENCY_ROUTE_PROSPECT_RESEARCH: 'openrouter',
    AGENCY_ROUTE_PROSPECT_QUALIFICATION: 'openrouter',
    AGENCY_ROUTE_SEO_MONITORING: 'openrouter',
    AGENCY_ROUTE_REPORT_GENERATION: 'openrouter',
    AGENCY_ROUTE_CLIENT_FOLLOWUP: 'openrouter',
    AGENCY_ROUTE_INVOICE_REMINDER: 'openrouter',
  });

  assert.equal(result.configured, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.providers, ['openrouter']);
});

test('multi-provider readiness rejects unsupported provider overrides', () => {
  const result = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'multi-provider',
    AGENCY_ROUTE_GENERAL: 'unknown-provider',
  });

  assert.equal(result.configured, false);
  assert.ok(result.missing.some((item) => item.includes('AGENCY_ROUTE_GENERAL')));
});

test('multi-provider readiness reports only the missing selected provider fields', () => {
  const result = getAgencyModelRuntimeReadiness({
    AGENCY_MODEL_RUNTIME: 'multi-provider',
    AGENCY_ROUTE_GENERAL: 'openrouter',
    AGENCY_ROUTE_PROSPECT_RESEARCH: 'openrouter',
    AGENCY_ROUTE_PROSPECT_QUALIFICATION: 'openrouter',
    AGENCY_ROUTE_SEO_MONITORING: 'openrouter',
    AGENCY_ROUTE_REPORT_GENERATION: 'openrouter',
    AGENCY_ROUTE_CLIENT_FOLLOWUP: 'openrouter',
    AGENCY_ROUTE_INVOICE_REMINDER: 'openrouter',
  });

  assert.equal(result.configured, false);
  assert.deepEqual(result.missing, ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL']);
});


test('unknown automation task types inherit the explicit general route', () => {
  const route = resolveAgencyProviderForTask('website_audit', {
    AGENCY_ROUTE_GENERAL: 'openrouter',
    AGENCY_ROUTE_WEBSITE_AUDIT: 'gemini',
  });
  assert.deepEqual(route, {
    task: 'general',
    routeName: 'AGENCY_ROUTE_GENERAL',
    provider: 'openrouter',
  });
});

test('known task types honour their own explicit provider route', () => {
  const route = resolveAgencyProviderForTask('seo_monitoring', {
    AGENCY_ROUTE_SEO_MONITORING: 'openrouter',
    AGENCY_ROUTE_GENERAL: 'groq',
  });
  assert.deepEqual(route, {
    task: 'seo_monitoring',
    routeName: 'AGENCY_ROUTE_SEO_MONITORING',
    provider: 'openrouter',
  });
});


test('worker readiness uses the same activation gates as the worker route', async () => {
  const readiness = readFileSync('src/app/api/system/readiness/route.ts', 'utf8');
  const worker = readFileSync('src/app/api/worker/route.ts', 'utf8');
  for (const flag of ['WORKER_EXECUTION_ENABLED', 'SCHEDULER_TRIGGER_CONFIGURED', 'CRON_SECRET', 'DATABASE_URL']) {
    assert.ok(worker.includes(flag), `worker route must gate on ${flag}`);
    assert.ok(readiness.includes(flag), `readiness route must report ${flag}`);
  }
  assert.match(readiness, /configured: process\.env\.WORKER_EXECUTION_ENABLED === 'true'/);
  assert.match(readiness, /modelReady/);
});

test('scheduler gives the worker time to finish its bounded provider request', () => {
  const workflow = readFileSync('.github/workflows/agencyos-scheduler.yml', 'utf8');
  assert.match(workflow, /--max-time 55/);
  assert.match(workflow, /AGENCYOS_WORKER_URL/);
  assert.match(workflow, /CRON_SECRET/);
});
