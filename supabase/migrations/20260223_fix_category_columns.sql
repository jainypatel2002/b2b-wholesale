-- Ensure categories has is_active and deleted_at
alter table public.categories
  add column if not exists is_active boolean not null default true;

alter table public.categories
  add column if not exists deleted_at timestamptz;

alter table public.categories
  add column if not exists deleted_reason text;

-- Ensure subcategories has is_active and deleted_at
alter table public.subcategories
  add column if not exists is_active boolean not null default true;

alter table public.subcategories
  add column if not exists deleted_at timestamptz;

alter table public.subcategories
  add column if not exists deleted_reason text;

-- Ensure products has is_active and deleted_at (aligning with newer convention)
alter table public.products
  add column if not exists is_active boolean not null default true;

alter table public.products
  add column if not exists deleted_at timestamptz;

alter table public.products
  add column if not exists deleted_reason text;

-- Backfill logic for products if active column exists and is_active is default
do $$
begin
    -- If 'active' column exists in products, sync it to 'is_active' for rows where is_active is default
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'active') then
        update public.products
        set is_active = active
        where is_active = true and active is not null; -- Only update if is_active is roughly default (true) to respect 'active' source of truth
    end if;
end
$$;
