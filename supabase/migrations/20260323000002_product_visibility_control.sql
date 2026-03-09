-- 20260323000002_product_visibility_control.sql
-- Distributor-controlled vendor product visibility.

alter table public.products
  add column if not exists is_visible_to_vendors boolean;

update public.products
set is_visible_to_vendors = true
where is_visible_to_vendors is null;

alter table public.products
  alter column is_visible_to_vendors set default true;

alter table public.products
  alter column is_visible_to_vendors set not null;

alter table public.products
  add column if not exists vendor_visibility_scope text;

update public.products
set vendor_visibility_scope = 'all'
where vendor_visibility_scope is null
   or btrim(vendor_visibility_scope) = ''
   or vendor_visibility_scope not in ('all', 'selected');

alter table public.products
  alter column vendor_visibility_scope set default 'all';

alter table public.products
  alter column vendor_visibility_scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_vendor_visibility_scope_chk'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_vendor_visibility_scope_chk
      check (vendor_visibility_scope in ('all', 'selected')) not valid;
  end if;
end $$;

alter table public.products
  validate constraint products_vendor_visibility_scope_chk;

create index if not exists products_distributor_vendor_visibility_idx
  on public.products (distributor_id, is_visible_to_vendors, vendor_visibility_scope)
  where deleted_at is null;

create table if not exists public.product_vendor_visibility (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_vendor_visibility_dist_vendor_product_uidx
  on public.product_vendor_visibility (distributor_id, vendor_id, product_id);

create index if not exists product_vendor_visibility_dist_product_idx
  on public.product_vendor_visibility (distributor_id, product_id);

create index if not exists product_vendor_visibility_vendor_dist_idx
  on public.product_vendor_visibility (vendor_id, distributor_id);

create index if not exists product_vendor_visibility_product_vendor_idx
  on public.product_vendor_visibility (product_id, vendor_id);

create or replace function public.set_product_vendor_visibility_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_vendor_visibility_updated_at on public.product_vendor_visibility;
create trigger trg_product_vendor_visibility_updated_at
before update on public.product_vendor_visibility
for each row
execute function public.set_product_vendor_visibility_updated_at();

create or replace function public.product_is_visible_to_vendor(
  p_is_visible_to_vendors boolean,
  p_vendor_visibility_scope text,
  p_distributor_id uuid,
  p_product_id uuid,
  p_vendor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_vendor_id is not null
    and coalesce(p_is_visible_to_vendors, true)
    and case coalesce(nullif(p_vendor_visibility_scope, ''), 'all')
      when 'selected' then exists (
        select 1
        from public.product_vendor_visibility pvv
        where pvv.distributor_id = p_distributor_id
          and pvv.product_id = p_product_id
          and pvv.vendor_id = p_vendor_id
      )
      else true
    end;
$$;

revoke all on function public.product_is_visible_to_vendor(boolean, text, uuid, uuid, uuid) from public;
grant execute on function public.product_is_visible_to_vendor(boolean, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.product_is_visible_to_vendor(boolean, text, uuid, uuid, uuid) to service_role;

alter table public.product_vendor_visibility enable row level security;

drop policy if exists "product_vendor_visibility: distributor full access"
  on public.product_vendor_visibility;

create policy "product_vendor_visibility: distributor full access"
  on public.product_vendor_visibility
  for all
  to authenticated
  using (
    auth.uid() = distributor_id
    and exists (
      select 1
      from public.distributor_vendors dv
      where dv.distributor_id = product_vendor_visibility.distributor_id
        and dv.vendor_id = product_vendor_visibility.vendor_id
    )
    and exists (
      select 1
      from public.products p
      where p.id = product_vendor_visibility.product_id
        and p.distributor_id = product_vendor_visibility.distributor_id
        and p.deleted_at is null
    )
  )
  with check (
    auth.uid() = distributor_id
    and exists (
      select 1
      from public.distributor_vendors dv
      where dv.distributor_id = product_vendor_visibility.distributor_id
        and dv.vendor_id = product_vendor_visibility.vendor_id
    )
    and exists (
      select 1
      from public.products p
      where p.id = product_vendor_visibility.product_id
        and p.distributor_id = product_vendor_visibility.distributor_id
        and p.deleted_at is null
    )
  );

grant select, insert, update, delete on table public.product_vendor_visibility to authenticated;

alter table public.products enable row level security;

drop policy if exists "Vendors can view products from active distributor" on public.products;

create policy "Vendors can view products from active distributor"
on public.products for select
to authenticated
using (
  auth.uid() = distributor_id
  or (
    distributor_id = public.get_my_active_distributor_id()
    and deleted_at is null
    and coalesce(is_active, active, true) = true
    and public.product_is_visible_to_vendor(
      is_visible_to_vendors,
      vendor_visibility_scope,
      distributor_id,
      id,
      auth.uid()
    )
  )
);

drop policy if exists "Vendor price overrides: vendor read own"
  on public.vendor_price_overrides;

create policy "Vendor price overrides: vendor read own"
  on public.vendor_price_overrides
  for select
  to authenticated
  using (
    auth.uid() = vendor_id
    and exists (
      select 1
      from public.distributor_vendors dv
      where dv.distributor_id = vendor_price_overrides.distributor_id
        and dv.vendor_id = vendor_price_overrides.vendor_id
    )
    and exists (
      select 1
      from public.products p
      where p.id = vendor_price_overrides.product_id
        and p.distributor_id = vendor_price_overrides.distributor_id
        and p.deleted_at is null
        and coalesce(p.is_active, p.active, true) = true
        and public.product_is_visible_to_vendor(
          p.is_visible_to_vendors,
          p.vendor_visibility_scope,
          p.distributor_id,
          p.id,
          vendor_price_overrides.vendor_id
        )
    )
  );

drop policy if exists "product_barcodes: vendor read linked" on public.product_barcodes;

create policy "product_barcodes: vendor read linked"
on public.product_barcodes
for select
to authenticated
using (
  exists (
    select 1
    from public.products p
    join public.distributor_vendors dv
      on dv.distributor_id = product_barcodes.distributor_id
     and dv.vendor_id = auth.uid()
    where p.id = product_barcodes.product_id
      and p.distributor_id = product_barcodes.distributor_id
      and p.deleted_at is null
      and coalesce(p.is_active, p.active, true) = true
      and public.product_is_visible_to_vendor(
        p.is_visible_to_vendors,
        p.vendor_visibility_scope,
        p.distributor_id,
        p.id,
        auth.uid()
      )
  )
);

drop policy if exists "vendor_favorites: vendor read own" on public.vendor_favorites;

create policy "vendor_favorites: vendor read own"
  on public.vendor_favorites
  for select
  to authenticated
  using (
    auth.uid() = vendor_id
    and exists (
      select 1
      from public.products p
      join public.distributor_vendors dv
        on dv.distributor_id = p.distributor_id
       and dv.vendor_id = auth.uid()
      where p.id = vendor_favorites.product_id
        and p.deleted_at is null
        and coalesce(p.is_active, p.active, true) = true
        and public.product_is_visible_to_vendor(
          p.is_visible_to_vendors,
          p.vendor_visibility_scope,
          p.distributor_id,
          p.id,
          auth.uid()
        )
    )
  );

drop policy if exists "vendor_favorites: vendor insert own" on public.vendor_favorites;

create policy "vendor_favorites: vendor insert own"
  on public.vendor_favorites
  for insert
  to authenticated
  with check (
    auth.uid() = vendor_id
    and exists (
      select 1
      from public.products p
      join public.distributor_vendors dv
        on dv.distributor_id = p.distributor_id
       and dv.vendor_id = auth.uid()
      where p.id = vendor_favorites.product_id
        and p.deleted_at is null
        and coalesce(p.is_active, p.active, true) = true
        and public.product_is_visible_to_vendor(
          p.is_visible_to_vendors,
          p.vendor_visibility_scope,
          p.distributor_id,
          p.id,
          auth.uid()
        )
    )
  );

create or replace function public.get_vendor_catalog_prices(
  p_distributor_id uuid
)
returns table (
  id uuid,
  category_id uuid,
  category_node_id uuid,
  name text,
  sku text,
  base_unit_price numeric(10,4),
  base_case_price numeric(10,4),
  override_unit_price numeric(10,4),
  override_case_price numeric(10,4),
  allow_piece boolean,
  allow_case boolean,
  units_per_case integer,
  stock_qty integer,
  stock_pieces integer,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.distributor_vendors dv
    where dv.distributor_id = p_distributor_id
      and dv.vendor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    p.id,
    p.category_id,
    p.category_node_id,
    p.name,
    p.sku,
    coalesce(p.sell_per_unit, p.sell_price) as base_unit_price,
    coalesce(
      p.sell_per_case,
      p.price_case,
      case
        when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
          then round(coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric, 4)
        else null
      end
    ) as base_case_price,
    coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) as override_unit_price,
    coalesce(
      vpo.price_per_case,
      case
        when coalesce(p.units_per_case, 1) > 1 and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) is not null
          then round(coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) * p.units_per_case::numeric, 4)
        else null
      end
    ) as override_case_price,
    p.allow_piece,
    p.allow_case,
    p.units_per_case,
    p.stock_qty,
    p.stock_pieces,
    coalesce(p.is_active, p.active, true) as is_active,
    p.created_at
  from public.products p
  left join public.vendor_price_overrides vpo
    on vpo.distributor_id = p.distributor_id
   and vpo.vendor_id = auth.uid()
   and vpo.product_id = p.id
  where p.distributor_id = p_distributor_id
    and p.deleted_at is null
    and coalesce(p.is_active, p.active, true) = true
    and public.product_is_visible_to_vendor(
      p.is_visible_to_vendors,
      p.vendor_visibility_scope,
      p.distributor_id,
      p.id,
      auth.uid()
    )
  order by p.name asc;
end;
$$;

grant execute on function public.get_vendor_catalog_prices(uuid) to authenticated;
grant execute on function public.get_vendor_catalog_prices(uuid) to service_role;

create or replace function public.lookup_product_by_barcode(
  distributor_id uuid,
  barcode text
)
returns table (
  id uuid,
  name text,
  sku text,
  allow_piece boolean,
  allow_case boolean,
  units_per_case integer,
  sell_per_unit numeric(10,4),
  sell_per_case numeric(10,4),
  override_unit_price numeric(10,4),
  override_case_price numeric(10,4),
  matched_barcode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid := auth.uid();
  v_normalized_barcode text;
begin
  if distributor_id is null then
    return;
  end if;

  v_normalized_barcode := nullif(public.normalize_barcode(barcode), '');
  if v_normalized_barcode is null or char_length(v_normalized_barcode) < 6 then
    return;
  end if;

  if v_vendor_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_vendor_id
      and p.role = 'vendor'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.distributor_vendors dv
    where dv.distributor_id = lookup_product_by_barcode.distributor_id
      and dv.vendor_id = v_vendor_id
  ) then
    return;
  end if;

  return query
  select
    p.id,
    p.name,
    p.sku,
    coalesce(p.allow_piece, true) as allow_piece,
    coalesce(p.allow_case, true) as allow_case,
    greatest(1, coalesce(p.units_per_case, 1))::integer as units_per_case,
    coalesce(p.sell_per_unit, p.sell_price) as sell_per_unit,
    coalesce(p.sell_per_case, p.price_case) as sell_per_case,
    vpo.price_per_unit as override_unit_price,
    vpo.price_per_case as override_case_price,
    coalesce(pb.barcode, p.barcode) as matched_barcode
  from public.products p
  left join public.product_barcodes pb
    on pb.product_id = p.id
   and pb.distributor_id = p.distributor_id
   and pb.barcode = v_normalized_barcode
  left join public.vendor_price_overrides vpo
    on vpo.distributor_id = p.distributor_id
   and vpo.vendor_id = v_vendor_id
   and vpo.product_id = p.id
  where p.distributor_id = lookup_product_by_barcode.distributor_id
    and p.deleted_at is null
    and coalesce(p.is_active, p.active, true) = true
    and public.product_is_visible_to_vendor(
      p.is_visible_to_vendors,
      p.vendor_visibility_scope,
      p.distributor_id,
      p.id,
      v_vendor_id
    )
    and (
      pb.id is not null
      or p.barcode = v_normalized_barcode
    )
  order by
    case when pb.id is not null then 0 else 1 end,
    case when coalesce(pb.is_primary, false) then 0 else 1 end,
    p.created_at desc
  limit 1;
end;
$$;

revoke all on function public.lookup_product_by_barcode(uuid, text) from public;
grant execute on function public.lookup_product_by_barcode(uuid, text) to authenticated;
grant execute on function public.lookup_product_by_barcode(uuid, text) to service_role;
