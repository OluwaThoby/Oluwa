-- Lease-protected execution for owner-approved internal agent tasks.
-- Additive only. Do not apply to the primary database as part of feature development.
ALTER TABLE public.agent_tasks
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_tasks_attempt_count_check'
      AND conrelid = 'public.agent_tasks'::regclass
  ) THEN
    ALTER TABLE public.agent_tasks
      ADD CONSTRAINT agent_tasks_attempt_count_check CHECK (attempt_count >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_tasks_max_attempts_check'
      AND conrelid = 'public.agent_tasks'::regclass
  ) THEN
    ALTER TABLE public.agent_tasks
      ADD CONSTRAINT agent_tasks_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS agent_tasks_lease_expiry_idx
  ON public.agent_tasks (lease_expires_at)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.claim_agent_tasks(
  p_worker_id text,
  p_batch_size integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.agent_tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(btrim(p_worker_id)) < 1 OR length(p_worker_id) > 120 THEN
    RAISE EXCEPTION 'invalid worker id';
  END IF;
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 20 THEN
    RAISE EXCEPTION 'invalid batch size';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid lease duration';
  END IF;

  UPDATE public.agent_tasks
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      error_message = CASE
        WHEN attempt_count >= max_attempts THEN 'Worker lease expired; retry limit reached.'
        ELSE 'Worker lease expired; returned to queue.'
      END,
      finished_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
      updated_at = now()
  WHERE status = 'running'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at <= now();

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.agent_tasks
    WHERE status = 'queued'
      AND requires_approval = false
      AND attempt_count < max_attempts
    ORDER BY priority DESC, created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  ),
  claimed AS (
    UPDATE public.agent_tasks AS t
    SET status = 'running',
        attempt_count = t.attempt_count + 1,
        started_at = now(),
        finished_at = NULL,
        error_message = NULL,
        lease_owner = p_worker_id,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    FROM candidates AS c
    WHERE t.id = c.id
    RETURNING t.*
  )
  SELECT * FROM claimed;
END;
$$;

COMMENT ON FUNCTION public.claim_agent_tasks(text, integer, integer)
  IS 'Claims only queued internal agent tasks that do not require approval; uses SKIP LOCKED and bounded leases.';

REVOKE ALL ON FUNCTION public.claim_agent_tasks(text, integer, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.complete_agent_task(
  p_task_id uuid,
  p_lease_token uuid,
  p_status text,
  p_output jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  resulting_status text;
  resulting_attempt integer;
BEGIN
  IF p_task_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'task id and lease token are required';
  END IF;
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'invalid terminal task status';
  END IF;
  IF p_output IS NOT NULL AND octet_length(p_output::text) > 65536 THEN
    RAISE EXCEPTION 'task output exceeds the 64 KB limit';
  END IF;
  IF p_error_message IS NOT NULL AND length(p_error_message) > 2000 THEN
    RAISE EXCEPTION 'task error message exceeds the 2,000 character limit';
  END IF;

  UPDATE public.agent_tasks AS t
  SET status = CASE
        WHEN p_status = 'succeeded' THEN 'completed'
        WHEN t.attempt_count < t.max_attempts THEN 'queued'
        ELSE 'failed'
      END,
      output = CASE WHEN p_status = 'succeeded' THEN COALESCE(p_output, '{}'::jsonb) ELSE t.output END,
      error_message = CASE WHEN p_status = 'failed' THEN NULLIF(btrim(p_error_message), '') ELSE NULL END,
      finished_at = CASE
        WHEN p_status = 'failed' AND t.attempt_count < t.max_attempts THEN NULL
        ELSE now()
      END,
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE t.id = p_task_id
    AND t.status = 'running'
    AND t.requires_approval = false
    AND t.lease_token = p_lease_token
    AND t.lease_expires_at > now()
  RETURNING t.status, t.attempt_count INTO resulting_status, resulting_attempt;

  IF resulting_status IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.agent_task_events (task_id, event_type, details)
  VALUES (
    p_task_id,
    CASE WHEN p_status = 'succeeded' THEN 'worker_task_succeeded' ELSE 'worker_task_attempt_failed' END,
    jsonb_build_object(
      'requested_status', p_status,
      'resulting_status', resulting_status,
      'attempt_count', resulting_attempt
    )
  );

  RETURN resulting_status;
END;
$$;

COMMENT ON FUNCTION public.complete_agent_task(uuid, uuid, text, jsonb, text)
  IS 'Completes an internal agent task only with its current, unexpired lease token; retries are bounded and approval-required tasks are excluded.';

REVOKE ALL ON FUNCTION public.complete_agent_task(uuid, uuid, text, jsonb, text) FROM PUBLIC;
