-- AgencyOS revenue management: invoices, payments, retainers and expenses.
CREATE TABLE IF NOT EXISTS public.agency_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(line_items)='array'),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0 AND amount_paid <= total),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void')),
  issue_date date,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total = subtotal + tax_amount)
);
CREATE INDEX IF NOT EXISTS agency_invoices_client_due_idx ON public.agency_invoices(client_id,due_date DESC);
CREATE INDEX IF NOT EXISTS agency_invoices_status_due_idx ON public.agency_invoices(status,due_date);
CREATE TABLE IF NOT EXISTS public.agency_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.agency_invoices(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer','cash','card','payment_link','other')),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_payments_invoice_date_idx ON public.agency_payments(invoice_id,payment_date DESC);
CREATE TABLE IF NOT EXISTS public.agency_retainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  service_name text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','quarterly','annual')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_billing_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_retainers_due_idx ON public.agency_retainers(status,next_billing_date);
CREATE TABLE IF NOT EXISTS public.agency_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor text,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_expenses_date_idx ON public.agency_expenses(expense_date DESC);