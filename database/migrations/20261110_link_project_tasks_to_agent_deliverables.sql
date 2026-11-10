ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS source_agent_task_id uuid
  REFERENCES public.agent_tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_tasks_one_per_agent_suggestion_idx
  ON public.project_tasks (project_id, source_agent_task_id)
  WHERE source_agent_task_id IS NOT NULL;