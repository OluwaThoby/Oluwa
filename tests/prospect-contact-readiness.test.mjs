import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProspectContactReadiness } from '../src/lib/intelligence/prospect-contact-readiness.mjs';

const base = {
  business_email: 'owner@example.com',
  source_url: 'https://example.com/contact',
  consent_basis: 'explicit_consent',
  status: 'discovered',
};

test('contact requires recorded evidence and source before human approval', () => {
  const result = evaluateProspectContactReadiness(base);
  assert.equal(result.readyForHumanApproval, true);
  assert.equal(result.sendEnabled, false);
});

test('missing evidence is not treated as permission', () => {
  const result = evaluateProspectContactReadiness({ ...base, consent_basis: null, contact_reviewed: false });
  assert.equal(result.readyForHumanApproval, false);
  assert.ok(result.reasons.includes('contact_permission_or_lawful_basis_not_reviewed'));
});

test('suppressed contacts are never ready', () => {
  const result = evaluateProspectContactReadiness({ ...base, status: 'suppressed' });
  assert.equal(result.readyForHumanApproval, false);
  assert.ok(result.reasons.includes('contact_is_suppressed'));
});

test('invalid addresses and untraceable sources are rejected', () => {
  const result = evaluateProspectContactReadiness({ ...base, business_email: 'not-an-email', source_url: 'copied from web' });
  assert.ok(result.reasons.includes('valid_business_email_missing'));
  assert.ok(result.reasons.includes('verifiable_contact_source_missing'));
});
