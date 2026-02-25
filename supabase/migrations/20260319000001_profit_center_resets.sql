-- Profit Center reset checkpoints (analytics baseline only)
-- This migration is additive and does not modify transactional tables.

create extension if not exists "pgcrypto";

create table if not exists public.profit_center_resets (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  reset_at timestamptz not null default now(),
  reset_from_date date null,
  reset_to_date date null,
  note text null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profit_center_resets_date_window_chk check (
    reset_from_date is null
    or reset_to_date is null
    or reset_from_date <= reset_to_date
  )
);

create index if not exists idx_profit_center_resets_distributor_reset_at
  on public.profit_center_resets(distributor_id, reset_at desc);

alter table public.profit_center_resets enable row level security;

drop policy if exists "profit_center_resets: distributor read own" on public.profit_center_resets;
create policy "profit_center_resets: distributor read own"
  on public.profit_center_resets
  for select
  using (auth.uid() = distributor_id);

drop policy if exists "profit_center_resets: distributor insert own" on public.profit_center_resets;
create policy "profit_center_resets: distributor insert own"
  on public.profit_center_resets
  for insert
  with check (
    auth.uid() = distributor_id
    and auth.uid() = created_by
  );
