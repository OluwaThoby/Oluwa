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

/**
 * Validates the persisted state of a grant immediately before an adapter acts.
 * This is deliberately only a policy check: callers must still atomically
 * consume a use, record the action, and verify the external result.
 */
export function evaluateExecutionGrant({ permission, grant, now = new Date(), expected = {} } = {}) {
  if (!permission || !grant || typeof grant !== 'object') return { allowed: false, reason: 'missing_grant' };
  if (grant.status !== 'active') return { allowed: false, reason: 'grant_not_active' };
  if (grant.revokedAt) return { allowed: false, reason: 'grant_revoked' };
  if (!Array.isArray(grant.permissions) || !grant.permissions.includes(permission)) return { allowed: false, reason: 'permission_not_granted' };
  if (typeof grant.scope !== 'string' || grant.scope.trim().length < 3) return { allowed: false, reason: 'invalid_scope' };
  const startsAt = Date.parse(grant.startsAt);
  if (!grant.startsAt || !Number.isFinite(startsAt) || startsAt > now.getTime()) return { allowed: false, reason: 'grant_not_started' };
  const expiresAt = Date.parse(grant.expiresAt);
  if (!grant.expiresAt || !Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return { allowed: false, reason: 'grant_expired_or_invalid' };
  if (grant.maxUses != null && (!Number.isInteger(grant.maxUses) || grant.maxUses < 1 || !Number.isInteger(grant.uses) || grant.uses < 0 || grant.uses >= grant.maxUses)) return { allowed: false, reason: 'grant_use_limit_reached' };
  if (FINANCIAL.has(permission)) return { allowed: false, reason: 'financial_actions_require_separate_transaction_approval' };
  for (const key of ['agentKey', 'clientId', 'projectId', 'environment']) {
    if (expected[key] !== undefined && expected[key] !== grant[key]) {
      return { allowed: false, reason: `grant_${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_mismatch` };
    }
  }
  if (expected.resourceRef !== undefined && expected.resourceRef !== grant.resourceRef) {
    return { allowed: false, reason: 'grant_resource_scope_mismatch' };
  }
  return { allowed: true, reason: 'valid_scoped_grant' };
}

/**
 * Converts a persisted Neon row (snake_case) into the canonical policy shape.
 * Rejects malformed rows rather than silently treating missing fields as safe.
 */
export function normalizeExecutionGrant(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const permissions = row.permissions;
  if (!Array.isArray(permissions) || permissions.some((value) => typeof value !== 'string')) return null;
  const grant = {
    id: typeof row.id === 'string' ? row.id : null,
    status: row.status,
    permissions,
    scope: row.resource_scope,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    revokedAt: row.revoked_at instanceof Date ? row.revoked_at.toISOString() : row.revoked_at,
    maxUses: row.max_uses,
    uses: row.uses_count,
    agentKey: row.agent_key,
    clientId: row.client_id,
    projectId: row.project_id,
    environment: row.environment,
    resourceRef: row.resource_ref,
  };
  if (typeof grant.status !== 'string' ||
      typeof grant.scope !== 'string' ||
      typeof grant.agentKey !== 'string' ||
      typeof grant.environment !== 'string') return null;
  return grant;
}
