/**
 * Conservative contact-readiness policy. Evidence checklist only; not legal advice.
 * Draft preparation is separate from permission to send.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPTED_EVIDENCE = new Set(['explicit_consent','existing_customer_relationship','legitimate_interest_reviewed']);
export function evaluateProspectContactReadiness(prospect = {}) {
  const reasons = [];
  const email = typeof prospect.business_email === 'string' ? prospect.business_email.trim() : '';
  const evidence = ACCEPTED_EVIDENCE.has(prospect.consent_basis);
  if (!EMAIL_RE.test(email)) reasons.push('valid_business_email_missing');
  if (prospect.status === 'suppressed' || prospect.is_suppressed === true) reasons.push('contact_is_suppressed');
  if (prospect.status === 'do_not_contact') reasons.push('marked_do_not_contact');
  if (typeof prospect.source_url !== 'string' || !/^https:\/\//i.test(prospect.source_url.trim())) reasons.push('verifiable_contact_source_missing');
  if (!evidence) reasons.push('contact_permission_or_lawful_basis_not_reviewed');
  const hardBlock = reasons.some(x => ['valid_business_email_missing','contact_is_suppressed','marked_do_not_contact','verifiable_contact_source_missing'].includes(x));
  return {readyForHumanApproval:reasons.length===0,draftAllowed:!hardBlock,sendEnabled:false,nextStep:reasons.length?'resolve_evidence_gaps_before_approval':'human_review_and_separate_approval',reasons,evidenceType:evidence?prospect.consent_basis:null,disclaimer:'This checklist does not determine legal compliance or override email-provider terms. Provider policy and applicable law must be checked separately.'};
}
