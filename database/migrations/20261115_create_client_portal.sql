-- Secure client portal access and customer-submitted change requests.
CREATE TABLE IF NOT EXISTS public.client_portal_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_portal_invites_client_idx
  ON public.client_portal_invites(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_portal_sessions_client_idx
  ON public.client_portal_sessions(client_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.client_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 5 AND 8000),
  category text NOT NULL DEFAULT 'content' CHECK (category IN ('content','design','functionality','bug','other')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','needs_information','approved','in_progress','ready_for_review','completed','declined')),
  customer_visible_note text NOT NULL DEFAULT '',
  owner_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_change_requests_client_idx
  ON public.client_change_requests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_change_requests_project_idx
  ON public.client_change_requests(project_id, created_at DESC);
