-- Fix for the previous migrations which incorrectly referenced `price` instead of `sell_price`

-- 1. Fix get_vendor_catalog_prices
create or replace function public.get_vendor_catalog_prices(
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


-- 2. Fix execute_bulk_price_adjustment
create or replace function public.execute_bulk_price_adjustment(
    p_distributor_id uuid,
    p_scope text,       -- 'global', 'category', 'category_node'
    p_scope_id uuid,    -- null or ID mapping to scope
    p_type text,        -- 'fixed_cents', 'percent', 'overwrite_cents'
    p_value numeric     -- Amount to change
)
returns json
language plpgsql
security definer
as $$
declare
    v_batch_id uuid;
    v_updated_count integer := 0;
begin
    -- 1. Must own distributor
    if p_distributor_id != auth.uid() then
        return json_build_object('error', 'Unauthorized');
    end if;

    -- 2. Create batch
    insert into public.price_change_batches (distributor_id, created_by, scope, scope_id, adjustment_type, adjustment_value)
    values (p_distributor_id, auth.uid(), p_scope, p_scope_id, p_type, p_value)
    returning id into v_batch_id;

    -- 3. Execute bulk update logically inside CTE
    with eligible_products as (
        select id, sell_price from public.products
        where distributor_id = p_distributor_id
          and active = true and deleted_at is null
          and (
              (p_scope = 'global') or
              (p_scope = 'category' and category_id = p_scope_id) or
              (p_scope = 'category_node' and category_node_id = p_scope_id)
          )
    ),
    calculated_prices as (
        select 
            id as prod_id,
            sell_price as old_price,
            cast(
                case 
                    when p_type = 'fixed_cents' then sell_price + (p_value / 100.0)
                    when p_type = 'overwrite_cents' then (p_value / 100.0)
                    when p_type = 'percent' then sell_price * (1.0 + (p_value / 100.0))
                    else sell_price
                end as numeric
            ) as new_price
        from eligible_products
    ),
    -- Write history
    history_insert as (
        insert into public.price_change_items (batch_id, product_id, old_price_cents, new_price_cents)
        select 
            v_batch_id, 
            prod_id, 
            CAST(ROUND(old_price * 100) AS INTEGER), 
            CAST(ROUND(new_price * 100) AS INTEGER)
        from calculated_prices
        where new_price >= 0 -- safety check
    ),
    -- Execute main update
    do_update as (
        update public.products p
        set sell_price = cp.new_price,
            updated_at = now()
        from calculated_prices cp
        where p.id = cp.prod_id and cp.new_price >= 0
        returning p.id
    )
    select count(*) into v_updated_count from do_update;

    return json_build_object('success', true, 'affected_rows', v_updated_count);
end;
$$;
