/**
 * Atomically consumes one use of an owner-approved execution grant.
 * It validates exact scope and records a request; it never executes externally.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[a-f0-9]{32,128}$/i;
const PERMISSIONS = new Set([
  'external_message', 'content_publish', 'preview_deploy',
  'production_deploy', 'production_change',
]);

export function validateGrantConsumption(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, reason: 'invalid_request' };
  }
  if (!UUID.test(String(input.grantId || '')) ||
      !UUID.test(String(input.idempotencyKey || '')) ||
      (input.clientId != null && !UUID.test(String(input.clientId))) ||
      (input.projectId != null && !UUID.test(String(input.projectId)))) {
    return { valid: false, reason: 'invalid_identifiers' };
  }
  if (!PERMISSIONS.has(input.permission) ||
      typeof input.agentKey !== 'string' || !input.agentKey.trim() ||
      !['workspace', 'preview', 'production'].includes(input.environment) ||
      typeof input.resourceRef !== 'string' || !input.resourceRef.trim() ||
      input.actionType !== input.permission ||
      typeof input.requestFingerprint !== 'string' ||
      !FINGERPRINT.test(input.requestFingerprint)) {
    return { valid: false, reason: 'invalid_scope_or_action' };
  }
  return { valid: true, reason: 'valid_request' };
}

export async function consumeExecutionGrant(db, input) {
  const validation = validateGrantConsumption(input);
  if (!validation.valid) return { consumed: false, reason: validation.reason };
  if (typeof db !== 'function') return { consumed: false, reason: 'database_unavailable' };

  try {
    const rows = await db`
      SELECT public.consume_execution_grant(
        ${input.grantId}::uuid, ${input.permission}, ${input.agentKey},
        ${input.clientId ?? null}::uuid, ${input.projectId ?? null}::uuid,
        ${input.environment}, ${input.resourceRef}, ${input.actionType},
        ${input.requestFingerprint}, ${input.idempotencyKey}::uuid
      ) AS result
    `;
    const result = rows?.[0]?.result;
    if (!result || typeof result !== 'object' || typeof result.action_id !== 'string') {
      return { consumed: false, reason: 'invalid_database_response' };
    }
    return {
      consumed: true, duplicate: result.duplicate === true,
      actionId: result.action_id, grantId: result.grant_id, status: result.status,
    };
  } catch {
    return { consumed: false, reason: 'grant_consumption_failed' };
  }
}
