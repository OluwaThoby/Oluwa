import { nextCronOccurrence } from '../cron-schedule.mjs';

const MAX_DUE_JOBS_PER_TICK = 10;

/**
 * Materialize one due occurrence per active workflow. The database function
 * serializes competing scheduler calls and advances each workflow atomically.
 */
export async function materializeDueSchedules(db, now = new Date(), limit = MAX_DUE_JOBS_PER_TICK) {
  const batchSize = Math.max(1, Math.min(MAX_DUE_JOBS_PER_TICK, Number.isInteger(limit) ? limit : MAX_DUE_JOBS_PER_TICK));
  const dueJobs = await db`
    SELECT id, schedule_cron, timezone, next_run_at
    FROM public.automation_jobs
    WHERE status = 'active'
      AND next_run_at IS NOT NULL
      AND next_run_at <= ${now.toISOString()}::timestamptz
    ORDER BY next_run_at, id
    LIMIT ${batchSize}
  `;

  const materialized = [];
  for (const job of dueJobs) {
    try {
      const nextRunAt = nextCronOccurrence(
        String(job.schedule_cron),
        String(job.timezone),
        now,
      );
      const rows = await db`
        SELECT public.materialize_scheduled_automation_run(
          ${String(job.id)}::uuid,
          ${new Date(job.next_run_at).toISOString()}::timestamptz,
          ${nextRunAt.toISOString()}::timestamptz
        ) AS run_id
      `;
      if (rows[0]?.run_id) {
        materialized.push({ jobId: String(job.id), runId: String(rows[0].run_id) });
      }
    } catch {
      // A malformed legacy schedule must not prevent other due workflows
      // from being materialized. It remains due for owner inspection.
      materialized.push({ jobId: String(job.id), error: 'schedule_materialization_failed' });
    }
  }

  return { checked: dueJobs.length, materialized };
}
