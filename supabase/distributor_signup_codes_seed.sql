-- Admin helper: generate distributor signup codes (single-use by default).
-- Run in Supabase SQL editor as a privileged role (postgres/service_role).

-- Create a few random, non-guessable codes.
insert into public.distributor_signup_codes (
  code,
  is_active,
  max_uses,
  expires_at,
  note,
  created_by
)
values
  (public.generate_distributor_signup_code(16), true, 1, now() + interval '30 days', 'Distributor onboarding batch A', null),
  (public.generate_distributor_signup_code(16), true, 1, now() + interval '30 days', 'Distributor onboarding batch A', null),
  (public.generate_distributor_signup_code(16), true, 1, now() + interval '30 days', 'Distributor onboarding batch A', null)
returning id, code, is_active, max_uses, uses_count, expires_at, created_at, note;

-- Example: manually add a known code string (optional).
-- insert into public.distributor_signup_codes (code, max_uses, expires_at, note)
-- values ('DIST-EXAMPLE-2026', 1, now() + interval '7 days', 'Manual invite for specific distributor');

-- Example: deactivate a code immediately.
-- update public.distributor_signup_codes
-- set is_active = false
-- where code = 'DIST-EXAMPLE-2026';
