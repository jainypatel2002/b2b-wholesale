-- Tighten vendor override access and ensure canonical lookup performance.
-- Safe to run repeatedly.

create unique index if not exists vendor_price_overrides_dist_vendor_product_uidx
  on public.vendor_price_overrides(distributor_id, vendor_id, product_id);

create index if not exists vendor_price_overrides_vendor_distributor_idx
  on public.vendor_price_overrides(vendor_id, distributor_id);

create index if not exists vendor_price_overrides_product_vendor_idx
  on public.vendor_price_overrides(product_id, vendor_id);

alter table public.vendor_price_overrides enable row level security;

drop policy if exists "Vendor price overrides: distributor full access"
  on public.vendor_price_overrides;

create policy "Vendor price overrides: distributor full access"
  on public.vendor_price_overrides
  for all
  to authenticated
  using (
    auth.uid() = distributor_id
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
    )
  )
  with check (
    auth.uid() = distributor_id
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
  );
