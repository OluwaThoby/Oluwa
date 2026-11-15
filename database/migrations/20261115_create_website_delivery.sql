-- Additive website-delivery foundation for AgencyOS.
-- Apply to an isolated preview branch first. Customer-facing access is not
-- enabled by these tables alone; all current API access remains owner-gated.

CREATE TABLE IF NOT EXISTS public.website_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  build_number integer NOT NULL CHECK (build_number > 0),
  complexity text NOT NULL CHECK (complexity IN ('starter','business','commerce','custom_app')),
  status text NOT NULL DEFAULT 'requirements_review'
    CHECK (status IN ('requirements_review','brief_ready','planning','building','qa','awaiting_preview_approval','approved','deploying','live','blocked','cancelled')),
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_url text,
  production_url text,
  approval_required boolean NOT NULL DEFAULT true,
  approved_at timestamptz,
  deployed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, build_number)
);
CREATE INDEX IF NOT EXISTS website_builds_project_created_idx
  ON public.website_builds(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS website_builds_status_updated_idx
  ON public.website_builds(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.website_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  website_build_id uuid REFERENCES public.website_builds(id) ON DELETE SET NULL,
  requester_email text,
  request_text text NOT NULL CHECK (length(trim(request_text)) BETWEEN 5 AND 5000),
  change_type text NOT NULL DEFAULT 'unspecified'
    CHECK (change_type IN ('content','design','technical','unspecified')),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','needs_clarification','staging','qa','awaiting_customer_approval','awaiting_owner_approval','approved','rejected','published','cancelled')),
  requires_owner_approval boolean NOT NULL DEFAULT true,
  staging_preview_url text,
  decision_note text,
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_change_requests_project_created_idx
  ON public.website_change_requests(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS website_change_requests_status_created_idx
  ON public.website_change_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.website_monitoring_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  website_build_id uuid REFERENCES public.website_builds(id) ON DELETE SET NULL,
  url text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  authorisation_confirmed_at timestamptz,
  check_interval_minutes integer NOT NULL DEFAULT 60
    CHECK (check_interval_minutes BETWEEN 15 AND 1440),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, url)
);
CREATE INDEX IF NOT EXISTS website_monitoring_targets_due_idx
  ON public.website_monitoring_targets(next_check_at)
  WHERE active = true AND authorisation_confirmed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.website_monitoring_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.website_monitoring_targets(id) ON DELETE CASCADE,
  check_type text NOT NULL
    CHECK (check_type IN ('uptime','ssl','performance','broken_links','security_headers')),
  status text NOT NULL CHECK (status IN ('healthy','warning','critical','unknown','error')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_monitoring_checks_target_checked_idx
  ON public.website_monitoring_checks(target_id, checked_at DESC);

COMMENT ON TABLE public.website_builds IS
  'Versioned website delivery records; a record does not imply code generation or deployment has completed.';
COMMENT ON TABLE public.website_change_requests IS
  'Customer change requests routed through staging, QA and approval gates before publication.';
COMMENT ON TABLE public.website_monitoring_targets IS
  'Authorised customer website monitoring targets; inactive until owner confirms monitoring scope.';
COMMENT ON TABLE public.website_monitoring_checks IS
  'Auditable results of website monitoring checks.';
