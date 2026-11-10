-- Additive delivery-tracking schema for AgencyOS.
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at date NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS project_tasks_project_due_idx
  ON public.project_tasks (project_id, due_at NULLS LAST, sort_order, created_at);
CREATE INDEX IF NOT EXISTS project_tasks_status_due_idx
  ON public.project_tasks (status, due_at) WHERE status <> 'done';
