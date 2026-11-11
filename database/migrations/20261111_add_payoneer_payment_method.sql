-- Add Payoneer as a manually reconciled incoming-payment method.
-- This does not create a Payoneer API connection or initiate payments.
ALTER TABLE public.agency_payments
  DROP CONSTRAINT IF EXISTS agency_payments_method_check;

ALTER TABLE public.agency_payments
  ADD CONSTRAINT agency_payments_method_check
  CHECK (method IN ('bank_transfer','cash','card','payment_link','payoneer','other'));

COMMENT ON COLUMN public.agency_payments.method IS
  'Recorded payment channel. Payoneer entries represent funds manually confirmed as received; no provider API action is implied.';
