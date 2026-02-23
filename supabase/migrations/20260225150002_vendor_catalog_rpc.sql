-- 1. Create RPC for fast vendor catalog fetches combining overrides and base prices smoothly
-- Note: A Postgres View cannot take parameters (like current user session dynamically without slow RLS subqueries).
-- An RPC returning JSON or a TABLE is much more performant for catalog queries because we explicitly pass the dist_id.

create or replace function get_vendor_catalog_prices(
    p_distributor_id uuid
)
returns table (
    id uuid,
    category_id uuid,
    category_node_id uuid,
    name text,
    sku text,
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
security definer
as $$
begin
    -- 1. Verification: Vendor must be linked to the distributor they are querying
    if not exists (
        select 1 from public.vendor_distributor_links vdl
        where vdl.distributor_id = p_distributor_id
        and vdl.vendor_id = auth.uid()
        and vdl.status = 'active'
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
        p.sku,
        p.price as base_price_cents,
        coalesce(vpo.price_cents, p.price) as effective_price_cents,
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
      and p.is_active = true
      and p.deleted_at is null
    order by p.name asc;
end;
$$;
