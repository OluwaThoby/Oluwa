/**
 * AgencyOS execution policy — deterministic guardrail layer.
 * Classification never executes an action or grants permission.
 */
const RULES = [
  { permission: 'financial_action', risk: 'critical', pattern: /\b(spend|purchase|buy|subscribe|transfer|withdraw|refund|charge|pay|payment|payout|bank|credit card|financial commitment)\b/i },
  { permission: 'data_destructive', risk: 'critical', pattern: /\b(delete|destroy|purge|wipe|drop table|erase|remove customer data)\b/i },
  { permission: 'production_deploy', risk: 'high', pattern: /\b(deploy|deployment|release to production|push live|publish website|go live)\b/i },
  { permission: 'content_publish', risk: 'high', pattern: /\b(publish|post|schedule post|upload content|send newsletter)\b/i },
  { permission: 'external_message', risk: 'high', pattern: /\b(send email|send emails|email prospect|email customer|contact prospect|send message|send outreach|follow.?up email)\b/i },
  { permission: 'production_change', risk: 'high', pattern: /\b(modify live|change production|update live|edit live website|change dns|change domain|alter client site)\b/i },
];
const FINANCIAL = new Set(['financial_action']);
const HIGH_IMPACT = new Set(['data_destructive', 'production_deploy', 'content_publish', 'external_message', 'production_change']);

export function classifyRequestedActions(text = '') {
  const source = typeof text === 'string' ? text.slice(0, 30000) : '';
  const matches = RULES.filter((rule) => rule.pattern.test(source));
  const unique = [...new Map(matches.map((item) => [item.permission, item])).values()];
  return {
    permissions: unique.map((item) => item.permission),
    highestRisk: unique.some((item) => item.risk === 'critical') ? 'critical' : unique.some((item) => item.risk === 'high') ? 'high' : 'low',
    requiresExplicitApproval: unique.some((item) => FINANCIAL.has(item.permission) || HIGH_IMPACT.has(item.permission)),
    financialApprovalRequired: unique.some((item) => FINANCIAL.has(item.permission)),
    executionGranted: false,
  };
}

export function evaluateExecutionGrant({ permission, grant, now = new Date() } = {}) {
  if (!permission || !grant || typeof grant !== 'object') return { allowed: false, reason: 'missing_grant' };
  if (grant.revokedAt) return { allowed: false, reason: 'grant_revoked' };
  if (!Array.isArray(grant.permissions) || !grant.permissions.includes(permission)) return { allowed: false, reason: 'permission_not_granted' };
  if (typeof grant.scope !== 'string' || grant.scope.trim().length < 3) return { allowed: false, reason: 'invalid_scope' };
  if (!grant.expiresAt || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now.getTime()) return { allowed: false, reason: 'grant_expired_or_invalid' };
  if (grant.maxUses != null && (!Number.isInteger(grant.maxUses) || grant.maxUses < 1 || !Number.isInteger(grant.uses) || grant.uses >= grant.maxUses)) return { allowed: false, reason: 'grant_use_limit_reached' };
  if (FINANCIAL.has(permission)) return { allowed: false, reason: 'financial_actions_require_separate_transaction_approval' };
  return { allowed: true, reason: 'valid_scoped_grant' };
}
