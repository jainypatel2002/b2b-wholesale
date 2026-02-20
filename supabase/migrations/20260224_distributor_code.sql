-- 1. Add distributor_code (for distributors)
alter table public.profiles
  add column if not exists distributor_code text unique;

-- 2. Add active_distributor_id (for vendors)
alter table public.profiles
  add column if not exists active_distributor_id uuid references public.profiles(id);

-- 3. Ensure 'distributor_vendors' table exists (aliased as vendor_distributors in request)
-- The codebase uses 'distributor_vendors'. We will stick to that to avoid breaking changes.
create table if not exists public.distributor_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references auth.users(id) on delete cascade,
  distributor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (vendor_id, distributor_id)
);

-- Enable RLS on distributor_vendors if not already
alter table public.distributor_vendors enable row level security;

-- Policies for distributor_vendors
do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'distributor_vendors' and policyname = 'Vendors can view their own links') then
        create policy "Vendors can view their own links"
            on public.distributor_vendors for select
            using (vendor_id = auth.uid());
    end if;

    if not exists (select 1 from pg_policies where tablename = 'distributor_vendors' and policyname = 'Vendors can insert their own links') then
        create policy "Vendors can insert their own links"
            on public.distributor_vendors for insert
            with check (vendor_id = auth.uid());
    end if;
    
    if not exists (select 1 from pg_policies where tablename = 'distributor_vendors' and policyname = 'Distributors can view their own links') then
        create policy "Distributors can view their own links"
            on public.distributor_vendors for select
            using (distributor_id = auth.uid());
    end if;
end
$$;


-- 4. Auto-generate distributor code function & trigger
create or replace function public.generate_unique_distributor_code()
returns trigger
language plpgsql
security definer
as $$
declare
  new_code text;
  exists_already boolean;
begin
  -- Only for distributors
  if NEW.role != 'distributor' then
    return NEW;
  end if;

  -- If already has code, do nothing
  if NEW.distributor_code is not null then
    return NEW;
  end if;

  loop
    -- Generate 8-char uppercase alphanumeric code (e.g. DIST-AB12CD34)
    new_code := 'DIST-' || upper(substr(md5(random()::text), 1, 8));

    select exists(select 1 from public.profiles where distributor_code = new_code)
    into exists_already;

    if not exists_already then
      NEW.distributor_code := new_code;
      exit;
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists ensure_distributor_code on public.profiles;
create trigger ensure_distributor_code
  before insert or update on public.profiles
  for each row
  execute function public.generate_unique_distributor_code();

-- 5. Backfill existing distributors
do $$
declare
  r record;
  new_code text;
  exists_already boolean;
begin
  for r in select id from public.profiles where role = 'distributor' and distributor_code is null loop
    loop
      new_code := 'DIST-' || upper(substr(md5(random()::text), 1, 8));
      if not exists(select 1 from public.profiles where distributor_code = new_code) then
        update public.profiles set distributor_code = new_code where id = r.id;
        exit;
      end if;
    end loop;
  end loop;
end;
$$;
