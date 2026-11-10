import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgencyModelRuntimeReadiness } from '../src/lib/intelligence/runtime-config.mjs';

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
