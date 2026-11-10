CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  token_hash char(64) PRIMARY KEY,
  email_normalized text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_unsubscribe_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT email_unsubscribe_email_nonempty CHECK (length(trim(email_normalized)) >= 5),
  CONSTRAINT email_unsubscribe_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS email_unsubscribe_tokens_expiry_idx
  ON public.email_unsubscribe_tokens (expires_at)
  WHERE consumed_at IS NULL;
