import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProspectContactReadiness } from '../src/lib/intelligence/prospect-contact-readiness.mjs';
const base={business_email:'owner@example.com',source_url:'https://example.com/contact',consent_basis:'explicit_consent',status:'discovered'};
test('complete evidence proceeds only to separate human approval',()=>{const r=evaluateProspectContactReadiness(base);assert.equal(r.readyForHumanApproval,true);assert.equal(r.draftAllowed,true);assert.equal(r.sendEnabled,false);});
test('missing permission evidence blocks approval but allows a review draft',()=>{const r=evaluateProspectContactReadiness({...base,consent_basis:null});assert.equal(r.readyForHumanApproval,false);assert.equal(r.draftAllowed,true);assert.ok(r.reasons.includes('contact_permission_or_lawful_basis_not_reviewed'));});
test('suppression-table matches block outreach preparation',()=>{const r=evaluateProspectContactReadiness({...base,is_suppressed:true});assert.equal(r.readyForHumanApproval,false);assert.equal(r.draftAllowed,false);assert.ok(r.reasons.includes('contact_is_suppressed'));});
test('suppressed and do-not-contact records are blocked',()=>{for(const status of ['suppressed','do_not_contact']){const r=evaluateProspectContactReadiness({...base,status});assert.equal(r.readyForHumanApproval,false);assert.equal(r.draftAllowed,false);}});
test('invalid addresses and untraceable sources are rejected',()=>{const r=evaluateProspectContactReadiness({...base,business_email:'not-an-email',source_url:'copied from web'});assert.ok(r.reasons.includes('valid_business_email_missing'));assert.ok(r.reasons.includes('verifiable_contact_source_missing'));assert.equal(r.draftAllowed,false);});
