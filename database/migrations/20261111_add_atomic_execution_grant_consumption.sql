-- Atomic, single-use consumption of an already-approved execution grant.
-- This migration is additive and MUST be reviewed/applied separately.
CREATE OR REPLACE FUNCTION public.consume_execution_grant(
  p_grant_id uuid,
  p_permission text,
  p_agent_key text,
  p_client_id uuid,
  p_project_id uuid,
  p_environment text,
  p_resource_ref text,
  p_action_type text,
  p_request_fingerprint text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grant public.execution_grants%ROWTYPE;
  v_existing public.execution_action_log%ROWTYPE;
  v_action_id uuid;
BEGIN
  IF p_grant_id IS NULL OR p_permission IS NULL OR p_agent_key IS NULL
     OR p_environment IS NULL OR p_resource_ref IS NULL OR btrim(p_resource_ref) = ''
     OR p_action_type IS NULL OR length(btrim(p_action_type)) NOT BETWEEN 3 AND 100
     OR p_request_fingerprint IS NULL OR length(p_request_fingerprint) NOT BETWEEN 32 AND 128
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_execution_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.execution_action_log
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Idempotent retries still have to match the grant's original authority
    -- scope; an existing key must not bypass client/project/environment checks.
    SELECT * INTO v_grant
    FROM public.execution_grants
    WHERE id = p_grant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'execution_grant_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing.grant_id = p_grant_id
       AND v_existing.agent_key = p_agent_key
       AND v_existing.action_type = p_action_type
       AND v_existing.resource_ref = p_resource_ref
       AND v_existing.request_fingerprint = p_request_fingerprint
       AND p_action_type = p_permission
       AND v_grant.agent_key = p_agent_key
       AND v_grant.client_id IS NOT DISTINCT FROM p_client_id
       AND v_grant.project_id IS NOT DISTINCT FROM p_project_id
       AND v_grant.environment = p_environment
       AND v_grant.resource_scope = p_resource_ref
       AND p_permission = ANY(v_grant.permissions) THEN
      RETURN jsonb_build_object(
        'action_id', v_existing.id,
        'grant_id', v_existing.grant_id,
        'status', v_existing.status,
        'duplicate', true
      );
    END IF;
    RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_grant
  FROM public.execution_grants
  WHERE id = p_grant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'execution_grant_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- A concurrent retry may have passed the first lookup before the first
  -- transaction committed. Recheck after the grant lock to return its record.
  SELECT * INTO v_existing
  FROM public.execution_action_log
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    -- The retry may have raced with the first consumer. Revalidate the full
    -- authority scope before returning the existing action.
    IF v_existing.grant_id = p_grant_id
       AND v_existing.agent_key = p_agent_key
       AND v_existing.action_type = p_action_type
       AND v_existing.resource_ref = p_resource_ref
       AND v_existing.request_fingerprint = p_request_fingerprint
       AND p_action_type = p_permission
       AND v_grant.agent_key = p_agent_key
       AND v_grant.client_id IS NOT DISTINCT FROM p_client_id
       AND v_grant.project_id IS NOT DISTINCT FROM p_project_id
       AND v_grant.environment = p_environment
       AND v_grant.resource_scope = p_resource_ref
       AND p_permission = ANY(v_grant.permissions) THEN
      RETURN jsonb_build_object(
        'action_id', v_existing.id,
        'grant_id', v_existing.grant_id,
        'status', v_existing.status,
        'duplicate', true
      );
    END IF;
    RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
  END IF;

  IF v_grant.status <> 'active' OR v_grant.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'execution_grant_inactive' USING ERRCODE = '42501';
  END IF;
  IF v_grant.starts_at > now() OR v_grant.expires_at <= now() THEN
    RAISE EXCEPTION 'execution_grant_outside_validity_window' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_permission = ANY(v_grant.permissions)) OR p_action_type <> p_permission THEN
    RAISE EXCEPTION 'execution_permission_or_action_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_grant.agent_key <> p_agent_key
     OR v_grant.client_id IS DISTINCT FROM p_client_id
     OR v_grant.project_id IS DISTINCT FROM p_project_id
     OR v_grant.environment <> p_environment
     OR v_grant.resource_scope <> p_resource_ref THEN
    RAISE EXCEPTION 'execution_grant_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_grant.max_uses IS NOT NULL AND v_grant.uses_count >= v_grant.max_uses THEN
    RAISE EXCEPTION 'execution_grant_use_limit_reached' USING ERRCODE = '42501';
  END IF;

  UPDATE public.execution_grants
  SET uses_count = uses_count + 1,
      status = CASE WHEN max_uses IS NOT NULL AND uses_count + 1 >= max_uses
                    THEN 'exhausted' ELSE status END,
      updated_at = now()
  WHERE id = v_grant.id;

  INSERT INTO public.execution_action_log (
    grant_id, agent_key, action_type, resource_ref,
    request_fingerprint, idempotency_key, status
  ) VALUES (
    v_grant.id, p_agent_key, p_action_type, p_resource_ref,
    p_request_fingerprint, p_idempotency_key, 'requested'
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object(
    'action_id', v_action_id,
    'grant_id', v_grant.id,
    'status', 'requested',
    'duplicate', false
  );
END;
$$;

COMMENT ON FUNCTION public.consume_execution_grant(uuid,text,text,uuid,uuid,text,text,text,text,uuid)
IS 'Atomically validates exact resource scope and consumes one grant use, records an idempotent request, and never performs the external action itself.';

-- The application database role (normally the function/table owner) can execute
-- this function; do not expose grant consumption to every database role.
REVOKE ALL ON FUNCTION public.consume_execution_grant(uuid,text,text,uuid,uuid,text,text,text,text,uuid) FROM PUBLIC;
