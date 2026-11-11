/**
 * Atomically consumes one use of an owner-approved execution grant.
 *
 * The database function validates scope, locks the grant row, increments its
 * use count, and records an idempotent action request in one transaction.
 * This function does not execute the external action.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[a-f0-9]{32,128}$/i;
const PERMISSIONS = new Set([
  'external_message',
  'content_publish',
  'preview_deploy',
  'production_deploy',
  'production_change',
]);

export function validateGrantConsumption(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, reason: 'invalid_request' };
  }
  if (!UUID.test(String(input.grantId || '')) ||
      !UUID.test(String(input.idempotencyKey || '')) ||
      !UUID.test(String(input.clientId || '')) ||
      !UUID.test(String(input.projectId || ''))) {
    return { valid: false, reason: 'invalid_identifiers' };
  }
  if (!PERMISSIONS.has(input.permission) ||
      typeof input.agentKey !== 'string' || !input.agentKey.trim() ||
      !['workspace', 'preview', 'production'].includes(input.environment) ||
      typeof input.resourceRef !== 'string' || !input.resourceRef.trim() ||
      typeof input.actionType !== 'string' ||
      input.actionType.trim().length < 3 || input.actionType.length > 100 ||
      typeof input.requestFingerprint !== 'string' ||
      !FINGERPRINT.test(input.requestFingerprint)) {
    return { valid: false, reason: 'invalid_scope_or_action' };
  }
  return { valid: true, reason: 'valid_request' };
}

export async function consumeExecutionGrant(db, input) {
  const validation = validateGrantConsumption(input);
  if (!validation.valid) {
    return { consumed: false, reason: validation.reason };
  }
  if (typeof db !== 'function') {
    return { consumed: false, reason: 'database_unavailable' };
  }

  try {
    const rows = await db`
      SELECT public.consume_execution_grant(
        ${input.grantId}::uuid,
        ${input.permission},
        ${input.agentKey},
        ${input.clientId}::uuid,
        ${input.projectId}::uuid,
        ${input.environment},
        ${input.resourceRef},
        ${input.actionType},
        ${input.requestFingerprint},
        ${input.idempotencyKey}::uuid
      ) AS result
    `;
    const result = rows?.[0]?.result;
    if (!result || typeof result !== 'object' || typeof result.action_id !== 'string') {
      return { consumed: false, reason: 'invalid_database_response' };
    }
    return {
      consumed: true,
      duplicate: result.duplicate === true,
      actionId: result.action_id,
      grantId: result.grant_id,
      status: result.status,
    };
  } catch {
    // Fail closed. Do not disclose SQL errors or imply that an action ran.
    return { consumed: false, reason: 'grant_consumption_failed' };
  }
}
