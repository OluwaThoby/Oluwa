CREATE TABLE IF NOT EXISTS public.client_interactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 interaction_type text NOT NULL CHECK (interaction_type IN ('call','email','meeting','message','note','support','renewal')),
 summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 2 AND 180),
 details text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_interactions_client_time_idx
 ON public.client_interactions(client_id, occurred_at DESC);
