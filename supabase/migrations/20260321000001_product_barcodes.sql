-- 20260321000001_product_barcodes.sql
-- Add first-class multi-barcode support per distributor product while preserving
-- the legacy products.barcode column for backward compatibility.

create extension if not exists "pgcrypto";

create or replace function public.normalize_barcode(input text)
returns text
language sql
immutable
strict
as $$
  select upper(regexp_replace(trim(input), '[^A-Za-z0-9]+', '', 'g'));
$$;

create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  barcode text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Constraint safety checks (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_barcodes_barcode_len_chk'
      and conrelid = 'public.product_barcodes'::regclass
  ) then
    alter table public.product_barcodes
      add constraint product_barcodes_barcode_len_chk
      check (char_length(barcode) >= 6);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_barcodes_barcode_normalized_chk'
      and conrelid = 'public.product_barcodes'::regclass
  ) then
    alter table public.product_barcodes
      add constraint product_barcodes_barcode_normalized_chk
      check (barcode = public.normalize_barcode(barcode));
  end if;
end
$$;

create unique index if not exists product_barcodes_distributor_barcode_uniq
  on public.product_barcodes (distributor_id, barcode);

create unique index if not exists product_barcodes_product_barcode_uniq
  on public.product_barcodes (product_id, barcode);

create unique index if not exists product_barcodes_primary_per_product_uniq
  on public.product_barcodes (product_id)
  where is_primary = true;

create index if not exists product_barcodes_distributor_barcode_idx
  on public.product_barcodes (distributor_id, barcode);

create index if not exists product_barcodes_product_id_idx
  on public.product_barcodes (product_id);

create or replace function public.product_barcodes_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_distributor_id uuid;
begin
  if tg_op = 'UPDATE' and new.product_id <> old.product_id then
    raise exception 'product_id cannot be changed for existing barcode mappings';
  end if;

  new.barcode := nullif(public.normalize_barcode(new.barcode), '');
  if new.barcode is null then
    raise exception 'Barcode cannot be empty';
  end if;

  if char_length(new.barcode) < 6 then
    raise exception 'Barcode must be at least 6 characters after normalization';
  end if;

  select p.distributor_id
    into v_distributor_id
  from public.products p
  where p.id = new.product_id;

  if v_distributor_id is null then
    raise exception 'Invalid product_id % for barcode mapping', new.product_id;
  end if;

  if new.distributor_id <> v_distributor_id then
    raise exception 'Barcode distributor_id must match product distributor_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_product_barcodes_before_write on public.product_barcodes;
create trigger trg_product_barcodes_before_write
before insert or update on public.product_barcodes
for each row
execute function public.product_barcodes_before_write();

create or replace function public.normalize_products_barcode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.barcode is null then
    return new;
  end if;

  new.barcode := nullif(public.normalize_barcode(new.barcode), '');
  return new;
end;
$$;

drop trigger if exists trg_normalize_products_barcode on public.products;
create trigger trg_normalize_products_barcode
before insert or update of barcode on public.products
for each row
execute function public.normalize_products_barcode();

-- Legacy compatibility sync: when products.barcode is written, keep aliases synced.
create or replace function public.sync_aliases_from_products_barcode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Skip empty/short values: legacy column can remain nullable.
  if new.barcode is null or char_length(new.barcode) < 6 then
    return new;
  end if;

  -- Keep only one primary alias for this product.
  update public.product_barcodes
  set is_primary = false
  where product_id = new.id
    and is_primary = true
    and barcode <> new.barcode;

  insert into public.product_barcodes (
    product_id,
    distributor_id,
    barcode,
    is_primary
  ) values (
    new.id,
    new.distributor_id,
    new.barcode,
    true
  )
  on conflict (product_id, barcode)
  do update
    set distributor_id = excluded.distributor_id,
        is_primary = true;

  return new;
end;
$$;

drop trigger if exists trg_sync_aliases_from_products_barcode on public.products;
create trigger trg_sync_aliases_from_products_barcode
after insert or update of barcode, distributor_id on public.products
for each row
execute function public.sync_aliases_from_products_barcode();

-- Backfill legacy primary barcode values into alias table.
insert into public.product_barcodes (
  product_id,
  distributor_id,
  barcode,
  is_primary
)
select
  p.id,
  p.distributor_id,
  public.normalize_barcode(p.barcode),
  false
from public.products p
where p.barcode is not null
  and char_length(public.normalize_barcode(p.barcode)) >= 6
on conflict (product_id, barcode) do nothing;

-- If a product still has no primary alias, promote its legacy barcode alias.
with candidate_primary as (
  select
    p.id as product_id,
    p.distributor_id,
    public.normalize_barcode(p.barcode) as normalized_barcode
  from public.products p
  where p.barcode is not null
    and char_length(public.normalize_barcode(p.barcode)) >= 6
), missing_primary as (
  select cp.*
  from candidate_primary cp
  where not exists (
    select 1
    from public.product_barcodes pb
    where pb.product_id = cp.product_id
      and pb.is_primary = true
  )
)
update public.product_barcodes pb
set is_primary = true
from missing_primary mp
where pb.product_id = mp.product_id
  and pb.distributor_id = mp.distributor_id
  and pb.barcode = mp.normalized_barcode;

alter table public.product_barcodes enable row level security;

drop policy if exists "product_barcodes: distributor read own" on public.product_barcodes;
create policy "product_barcodes: distributor read own"
on public.product_barcodes
for select
using (auth.uid() = distributor_id);

drop policy if exists "product_barcodes: distributor insert own" on public.product_barcodes;
create policy "product_barcodes: distributor insert own"
on public.product_barcodes
for insert
with check (auth.uid() = distributor_id);

drop policy if exists "product_barcodes: distributor update own" on public.product_barcodes;
create policy "product_barcodes: distributor update own"
on public.product_barcodes
for update
using (auth.uid() = distributor_id)
with check (auth.uid() = distributor_id);

drop policy if exists "product_barcodes: distributor delete own" on public.product_barcodes;
create policy "product_barcodes: distributor delete own"
on public.product_barcodes
for delete
using (auth.uid() = distributor_id);

drop policy if exists "product_barcodes: vendor read linked" on public.product_barcodes;
create policy "product_barcodes: vendor read linked"
on public.product_barcodes
for select
using (
  exists (
    select 1
    from public.distributor_vendors dv
    where dv.vendor_id = auth.uid()
      and dv.distributor_id = product_barcodes.distributor_id
  )
);
