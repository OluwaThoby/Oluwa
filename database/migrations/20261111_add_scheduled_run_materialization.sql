-- Idempotent schedule materialization for AgencyOS automation jobs.
-- Additive only; install and test on an isolated branch before any primary DB change.
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_job_scheduled_for_uidx
  ON public.automation_runs (job_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS automation_jobs_due_schedule_idx
  ON public.automation_jobs (next_run_at, id)
  WHERE status = 'active' AND next_run_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.materialize_scheduled_automation_run(
  p_job_id uuid,
  p_expected_due_at timestamptz,
  p_next_run_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  job_row public.automation_jobs%ROWTYPE;
  created_run_id uuid;
BEGIN
  IF p_job_id IS NULL OR p_expected_due_at IS NULL OR p_next_run_at IS NULL THEN
    RAISE EXCEPTION 'job id, expected due time and next run time are required';
  END IF;
  IF p_next_run_at <= now() OR p_next_run_at <= p_expected_due_at THEN
    RAISE EXCEPTION 'next run time must be in the future and after the due time';
  END IF;

  SELECT * INTO job_row
  FROM public.automation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR job_row.status <> 'active' THEN
    RETURN NULL;
  END IF;

  -- The expected timestamp is a compare-and-swap guard against competing
  -- scheduler invocations and a concurrently paused/rescheduled workflow.
  IF job_row.next_run_at IS DISTINCT FROM p_expected_due_at
     OR job_row.next_run_at > now() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.automation_runs
    (job_id, job_type, status, attempt_count, input, scheduled_for)
  VALUES (
    job_row.id,
    job_row.job_type,
    'queued',
    0,
    jsonb_build_object('scheduled_for', p_expected_due_at),
    p_expected_due_at
  )
  ON CONFLICT (job_id, scheduled_for)
    WHERE scheduled_for IS NOT NULL
    DO NOTHING
  RETURNING id INTO created_run_id;

  IF created_run_id IS NULL THEN
    SELECT id INTO created_run_id
    FROM public.automation_runs
    WHERE job_id = p_job_id AND scheduled_for = p_expected_due_at
    LIMIT 1;
  END IF;

  UPDATE public.automation_jobs
  SET next_run_at = p_next_run_at,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN created_run_id;
END;
$$;

COMMENT ON FUNCTION public.materialize_scheduled_automation_run(uuid, timestamptz, timestamptz)
  IS 'Creates at most one queued run for a due schedule occurrence and advances the schedule using a row lock and expected-time compare-and-swap.';

REVOKE ALL ON FUNCTION public.materialize_scheduled_automation_run(uuid, timestamptz, timestamptz) FROM PUBLIC;
