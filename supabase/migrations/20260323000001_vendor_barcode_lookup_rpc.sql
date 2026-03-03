-- 20260323000001_vendor_barcode_lookup_rpc.sql
-- Fast vendor barcode lookup RPC for rapid scan-to-cart workflows.

create index if not exists product_barcodes_barcode_idx
  on public.product_barcodes (barcode);

create index if not exists products_distributor_barcode_active_idx
  on public.products (distributor_id, barcode)
  where deleted_at is null;

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
