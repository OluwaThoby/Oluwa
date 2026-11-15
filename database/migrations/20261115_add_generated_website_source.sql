-- Add generated source and QA metadata to website builds.
-- Additive and safe to apply to the preview branch before production rollout.
ALTER TABLE public.website_builds
  ADD COLUMN IF NOT EXISTS generated_files jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qa_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

COMMENT ON COLUMN public.website_builds.generated_files IS
  'Generated source files stored privately for review; never published automatically.';
COMMENT ON COLUMN public.website_builds.qa_report IS
  'Deterministic pre-preview checks and review warnings for generated source.';
