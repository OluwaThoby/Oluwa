CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('unsubscribe', 'spam_complaint', 'hard_bounce', 'manual', 'legal_request')),
  source text NOT NULL DEFAULT 'owner',
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_email_nonempty CHECK (length(trim(email_normalized)) >= 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_email_unique ON public.email_suppressions (lower(email_normalized));
CREATE INDEX IF NOT EXISTS email_suppressions_created_idx ON public.email_suppressions (created_at DESC);
CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('accepted', 'delivered', 'deferred', 'hard_bounce', 'soft_bounce', 'complaint', 'unsubscribed', 'rejected')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  diagnostic_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT email_delivery_provider_event_unique UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS email_delivery_message_events_idx ON public.email_delivery_events (message_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS email_delivery_type_events_idx ON public.email_delivery_events (event_type, occurred_at DESC);
CREATE TABLE IF NOT EXISTS public.email_sender_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  from_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'paused', 'failed')),
  spf_status text NOT NULL DEFAULT 'unknown' CHECK (spf_status IN ('unknown', 'pass', 'fail')),
  dkim_status text NOT NULL DEFAULT 'unknown' CHECK (dkim_status IN ('unknown', 'pass', 'fail')),
  dmarc_status text NOT NULL DEFAULT 'unknown' CHECK (dmarc_status IN ('unknown', 'pass', 'fail')),
  alignment_status text NOT NULL DEFAULT 'unknown' CHECK (alignment_status IN ('unknown', 'pass', 'fail')),
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_sender_domain_format CHECK (domain = lower(domain) AND position('@' in domain) = 0)
);
CREATE INDEX IF NOT EXISTS email_sender_domains_status_idx ON public.email_sender_domains (status, updated_at DESC);