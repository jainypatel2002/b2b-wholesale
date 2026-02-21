-- 20260225150005_fix_vendor_links_schema_references.sql
-- Fix to correct the table name mapping for the Vendor<->Distributor linkage to use `distributor_vendors` instead of the non-existent `vendor_distributor_links`

-- 1. Fix get_vendor_catalog_prices mapping
create or replace function public.get_vendor_catalog_prices(
    p_distributor_id uuid
)
returns table (
    id uuid,
    category_id uuid,
    category_node_id uuid,
    name text,
    description text,
    sku text,
    image_url text,
    base_price_cents integer,
    effective_price_cents integer,
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
    -- 1. Verification: Vendor must be linked to the distributor they are querying
    if not exists (
        select 1 from public.distributor_vendors dv
        where dv.distributor_id = p_distributor_id
        and dv.vendor_id = auth.uid()
    ) then
        return; -- Return empty silently if not authorized.
    end if;

    -- 2. Return data combining the base products table with the specific vendor's overrides
    return query
    select 
        p.id,
        p.category_id,
        p.category_node_id,
        p.name,
        p.description,
        p.sku,
        p.image_url,
        CAST(ROUND(p.sell_price * 100) AS INTEGER) as base_price_cents,
        coalesce(vpo.price_cents, CAST(ROUND(p.sell_price * 100) AS INTEGER)) as effective_price_cents,
        p.allow_piece,
        p.allow_case,
        p.units_per_case,
        p.stock_qty,
        p.stock_pieces,
        p.active as is_active,
        p.created_at
    from public.products p
    left join public.vendor_price_overrides vpo 
        on p.id = vpo.product_id 
        and vpo.distributor_id = p.distributor_id 
        and vpo.vendor_id = auth.uid()
    where p.distributor_id = p_distributor_id
      and p.active = true
      and p.deleted_at is null
    order by p.name asc;
end;
$$;

-- Grant execution natively to authenticated users mapping their RLS correctly
grant execute on function public.get_vendor_catalog_prices(uuid) to authenticated;
grant execute on function public.get_vendor_catalog_prices(uuid) to service_role;


-- 2. Fix Vendor catalog nested category RLS logic failing validation due to wrong table
drop policy if exists "category_nodes: vendors can read linked distributor nodes" on public.category_nodes;

create policy "category_nodes: vendors can read linked distributor nodes" on public.category_nodes
    for select using (
        exists (
            select 1 from public.distributor_vendors dv
            where dv.distributor_id = category_nodes.distributor_id
            and dv.vendor_id = auth.uid()
        )
    );
