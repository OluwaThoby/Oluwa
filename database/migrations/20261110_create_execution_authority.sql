-- Durable scoped authority and immutable execution audit trail.
-- Financial and destructive permissions are deliberately excluded from general grants.
CREATE TABLE IF NOT EXISTS public.execution_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_name text NOT NULL CHECK (length(btrim(grant_name)) BETWEEN 3 AND 160),
  agent_key text NOT NULL REFERENCES public.agency_agents(agent_key),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_scope text NOT NULL CHECK (length(btrim(resource_scope)) BETWEEN 3 AND 500),
  environment text NOT NULL DEFAULT 'workspace' CHECK (environment IN ('workspace','preview','production')),
  permissions text[] NOT NULL CHECK (cardinality(permissions) BETWEEN 1 AND 10),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(limits::text) <= 4000),
  approved_by text NOT NULL,
  approval_reference text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired','exhausted')),
  max_uses integer CHECK (max_uses IS NULL OR max_uses BETWEEN 1 AND 100000),
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at),
  CHECK (uses_count <= COALESCE(max_uses, 2147483647)),
  CHECK (NOT ('financial_action' = ANY(permissions))),
  CHECK (NOT ('data_destructive' = ANY(permissions)))
);
CREATE INDEX IF NOT EXISTS execution_grants_active_agent_idx
  ON public.execution_grants (agent_key, expires_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS execution_grants_client_project_idx
  ON public.execution_grants (client_id, project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.execution_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.execution_grants(id),
  agent_key text NOT NULL REFERENCES public.agency_agents(agent_key),
  action_type text NOT NULL CHECK (length(btrim(action_type)) BETWEEN 3 AND 100),
  resource_ref text NOT NULL CHECK (length(btrim(resource_ref)) BETWEEN 1 AND 1000),
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint) BETWEEN 32 AND 128),
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','executing','provider_accepted','succeeded','failed','rolled_back','blocked')),
  provider_reference text,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(verification::text) <= 8000),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS execution_action_log_grant_time_idx
  ON public.execution_action_log (grant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_action_log_status_time_idx
  ON public.execution_action_log (status, created_at DESC);