/**
 * Conservative contact-readiness policy.
 * This is an evidence checklist, not a legal-basis determination.
 * Draft preparation is separate from permission to send.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPTED_EVIDENCE = new Set([
  'explicit_consent',
  'existing_customer_relationship',
  'legitimate_interest_reviewed',
  'public_business_contact_reviewed',
]);

export function evaluateProspectContactReadiness(prospect = {}) {
  const reasons = [];
  const email = typeof prospect.business_email === 'string' ? prospect.business_email.trim() : '';
  if (!EMAIL_RE.test(email)) reasons.push('valid_business_email_missing');
  if (prospect.status === 'suppressed') reasons.push('contact_is_suppressed');
  if (prospect.status === 'do_not_contact') reasons.push('marked_do_not_contact');
  if (typeof prospect.source_url !== 'string' || !/^https:\/\//i.test(prospect.source_url.trim())) {
    reasons.push('verifiable_contact_source_missing');
  }
  if (!ACCEPTED_EVIDENCE.has(prospect.consent_basis)) {
    reasons.push('contact_permission_or_lawful_basis_not_reviewed');
  }
  if (prospect.contact_reviewed !== true) reasons.push('human_contact_review_required');
  return {
    readyForHumanApproval: reasons.length === 0,
    sendEnabled: false,
    reasons,
    evidenceType: ACCEPTED_EVIDENCE.has(prospect.consent_basis) ? prospect.consent_basis : null,
    disclaimer: 'This checklist does not determine legal compliance or override email-provider terms.',
  };
}
