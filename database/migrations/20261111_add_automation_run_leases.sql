-- Atomic, leased claims for AgencyOS background runs.
-- Additive only. Apply to an isolated Neon branch first; production activation is separate.
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS automation_runs_queued_created_idx
  ON public.automation_runs (created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS automation_runs_lease_expiry_idx
  ON public.automation_runs (lease_expires_at)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.claim_automation_runs(
  p_worker_id text,
  p_batch_size integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.automation_runs
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

  -- Reclaim expired leases. Exhausted runs are terminal; others return to queue.
  UPDATE public.automation_runs AS r
  SET status = CASE
        WHEN r.attempt_count >= COALESCE(j.max_attempts, 3) THEN 'failed'
        ELSE 'queued'
      END,
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      error_message = CASE
        WHEN r.attempt_count >= COALESCE(j.max_attempts, 3)
          THEN 'Worker lease expired; retry limit reached.'
        ELSE 'Worker lease expired; returned to queue.'
      END,
      finished_at = CASE
        WHEN r.attempt_count >= COALESCE(j.max_attempts, 3) THEN now()
        ELSE NULL
      END
  FROM public.automation_jobs AS j
  WHERE r.job_id = j.id
    AND r.status = 'running'
    AND r.lease_expires_at IS NOT NULL
    AND r.lease_expires_at <= now();

  RETURN QUERY
  WITH candidates AS (
    SELECT r.id
    FROM public.automation_runs AS r
    JOIN public.automation_jobs AS j ON j.id = r.job_id
    WHERE r.status = 'queued'
      AND j.status = 'active'
      AND r.attempt_count < j.max_attempts
    ORDER BY r.created_at, r.id
    FOR UPDATE OF r SKIP LOCKED
    LIMIT p_batch_size
  ),
  claimed AS (
    UPDATE public.automation_runs AS r
    SET status = 'running',
        attempt_count = r.attempt_count + 1,
        started_at = now(),
        finished_at = NULL,
        error_message = NULL,
        lease_owner = p_worker_id,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    FROM candidates AS c
    WHERE r.id = c.id
    RETURNING r.*
  )
  SELECT * FROM claimed;
END;
$$;

COMMENT ON FUNCTION public.claim_automation_runs(text, integer, integer)
  IS 'Atomically claims queued AgencyOS automation runs using SKIP LOCKED and bounded leases; does not execute job actions.';

REVOKE ALL ON FUNCTION public.claim_automation_runs(text, integer, integer) FROM PUBLIC;
