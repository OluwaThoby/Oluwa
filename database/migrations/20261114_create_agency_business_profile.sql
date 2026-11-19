-- Central, owner-controlled source of truth for AgencyOS business context.
CREATE TABLE IF NOT EXISTS public.agency_business_profile (
  owner_email text PRIMARY KEY,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
