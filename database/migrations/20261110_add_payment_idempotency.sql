ALTER TABLE public.agency_payments
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS agency_payments_idempotency_key_idx
  ON public.agency_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
