CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Note: RLS is not strictly needed if we only use service_role to insert/read,
-- but we can enable it for safety.
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
