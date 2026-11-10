-- AgencyOS proposal drafts
-- Safe additive migration; does not alter or delete existing records.
CREATE TABLE IF NOT EXISTS public.agency_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  audit_id uuid NULL REFERENCES public.seo_audits(id) ON DELETE SET NULL,
  proposal jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','sent','accepted','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_proposals_prospect_created_idx
  ON public.agency_proposals (prospect_id, created_at DESC);
