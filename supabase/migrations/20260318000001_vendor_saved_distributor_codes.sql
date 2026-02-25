create table if not exists public.vendor_saved_distributor_codes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  distributor_code text not null,
  distributor_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz null,
  unique (vendor_id, distributor_code)
);

create index if not exists idx_vendor_saved_distributor_codes_vendor_id
  on public.vendor_saved_distributor_codes (vendor_id);

create index if not exists idx_vendor_saved_distributor_codes_vendor_code
  on public.vendor_saved_distributor_codes (vendor_id, distributor_code);

create or replace function public.set_vendor_saved_distributor_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vendor_saved_distributor_codes_updated_at on public.vendor_saved_distributor_codes;
create trigger set_vendor_saved_distributor_codes_updated_at
before update on public.vendor_saved_distributor_codes
for each row
execute function public.set_vendor_saved_distributor_codes_updated_at();

alter table public.vendor_saved_distributor_codes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_saved_distributor_codes'
      and policyname = 'vendor_saved_distributor_codes: vendor read own'
  ) then
    create policy "vendor_saved_distributor_codes: vendor read own"
      on public.vendor_saved_distributor_codes
      for select
      to authenticated
      using (vendor_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_saved_distributor_codes'
      and policyname = 'vendor_saved_distributor_codes: vendor insert own'
  ) then
    create policy "vendor_saved_distributor_codes: vendor insert own"
      on public.vendor_saved_distributor_codes
      for insert
      to authenticated
      with check (vendor_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_saved_distributor_codes'
      and policyname = 'vendor_saved_distributor_codes: vendor update own'
  ) then
    create policy "vendor_saved_distributor_codes: vendor update own"
      on public.vendor_saved_distributor_codes
      for update
      to authenticated
      using (vendor_id = auth.uid())
      with check (vendor_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_saved_distributor_codes'
      and policyname = 'vendor_saved_distributor_codes: vendor delete own'
  ) then
    create policy "vendor_saved_distributor_codes: vendor delete own"
      on public.vendor_saved_distributor_codes
      for delete
      to authenticated
      using (vendor_id = auth.uid());
  end if;
end
$$;

grant select, insert, update, delete on table public.vendor_saved_distributor_codes to authenticated;
