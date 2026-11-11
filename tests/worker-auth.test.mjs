import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedWorkerRequest } from '../src/lib/security/worker-auth.mjs';

const secret = 'a'.repeat(48);

test('accepts only the exact bearer secret', () => {
  assert.equal(isAuthorizedWorkerRequest(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedWorkerRequest(`bearer ${secret}`, secret), true);
});

test('rejects missing, short, malformed and incorrect worker credentials', () => {
  assert.equal(isAuthorizedWorkerRequest(null, secret), false);
  assert.equal(isAuthorizedWorkerRequest(secret, secret), false);
  assert.equal(isAuthorizedWorkerRequest('Bearer wrong', secret), false);
  assert.equal(isAuthorizedWorkerRequest(`Bearer ${secret}`, 'short'), false);
  assert.equal(isAuthorizedWorkerRequest(`Bearer ${secret}x`, secret), false);
});
