-- Migration: Modernize Vendor Price Overrides
-- Updates schema to support independent unit and case overrides and modernizes RPCs

-- 1. Add canonical columns to vendor_price_overrides
alter table public.vendor_price_overrides
add column if not exists price_per_unit numeric(10,4) null,
add column if not exists price_per_case numeric(10,4) null;

-- 2. Backfill price_per_unit from legacy price_cents
update public.vendor_price_overrides
set price_per_unit = price_cents::numeric / 100.0
where price_per_unit is null;

-- 3. Update get_vendor_catalog_prices RPC
drop function if exists public.get_vendor_catalog_prices(uuid);

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
    -- Verification: Vendor must be linked to the distributor they are querying
    if not exists (
        select 1 from public.distributor_vendors vdl
        where vdl.distributor_id = p_distributor_id
        and vdl.vendor_id = auth.uid()
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
        p.sell_per_unit as base_unit_price,
        p.sell_per_case as base_case_price,
        vpo.price_per_unit as override_unit_price,
        vpo.price_per_case as override_case_price,
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

-- 4. Update bulk_adjust_prices RPC to support new columns
CREATE OR REPLACE FUNCTION public.bulk_adjust_prices(
    p_distributor_id uuid,
    p_scope_type text,
    p_scope_id uuid,
    p_apply_mode text,
    p_vendor_ids uuid[] DEFAULT NULL,
    p_change_type text DEFAULT 'percent',
    p_value numeric DEFAULT 0,
    p_field text DEFAULT 'sell_price'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base_updated integer := 0;
    v_overrides_upserted integer := 0;
    v_product_ids uuid[];
    v_vendor_target_ids uuid[];
    v_batch_id uuid;
BEGIN
    -- Authorization
    IF p_distributor_id != auth.uid() THEN
        RETURN json_build_object('error', 'Unauthorized: distributor mismatch');
    END IF;

    -- Resolve product IDs in scope
    IF p_scope_type = 'category' THEN
        SELECT array_agg(id) INTO v_product_ids
        FROM public.products
        WHERE distributor_id = p_distributor_id
          AND category_id = p_scope_id
          AND deleted_at IS NULL;
    ELSIF p_scope_type = 'category_node' THEN
        WITH RECURSIVE node_tree AS (
            SELECT id FROM public.category_nodes
            WHERE id = p_scope_id AND distributor_id = p_distributor_id
            UNION ALL
            SELECT cn.id FROM public.category_nodes cn
            INNER JOIN node_tree nt ON cn.parent_id = nt.id
        )
        SELECT array_agg(p.id) INTO v_product_ids
        FROM public.products p
        WHERE p.distributor_id = p_distributor_id
          AND p.category_node_id IN (SELECT id FROM node_tree)
          AND p.deleted_at IS NULL;
    END IF;

    IF v_product_ids IS NULL OR array_length(v_product_ids, 1) IS NULL THEN
        RETURN json_build_object('success', true, 'products_affected', 0);
    END IF;

    -- Apply BASE updates safely
    IF p_apply_mode IN ('base_only', 'base_and_overrides') THEN
        IF p_field = 'sell_price' THEN
            WITH calc AS (
                SELECT id,
                    GREATEST(0, ROUND(
                        CASE
                            WHEN p_change_type = 'percent' THEN COALESCE(sell_per_unit, sell_price, 0) * (1.0 + p_value / 100.0)
                            WHEN p_change_type = 'fixed'   THEN COALESCE(sell_per_unit, sell_price, 0) + p_value
                            WHEN p_change_type = 'set'     THEN p_value
                            ELSE COALESCE(sell_per_unit, sell_price, 0)
                        END, 2)) as new_price
                FROM public.products
                WHERE id = ANY(v_product_ids)
            )
            UPDATE public.products p SET
                sell_per_unit = c.new_price,
                sell_price = c.new_price
            FROM calc c
            WHERE p.id = c.id;
        ELSIF p_field = 'price_case' THEN
            WITH calc AS (
                SELECT id,
                    GREATEST(0, ROUND(
                        CASE
                            WHEN p_change_type = 'percent' THEN COALESCE(sell_per_case, price_case, 0) * (1.0 + p_value / 100.0)
                            WHEN p_change_type = 'fixed'   THEN COALESCE(sell_per_case, price_case, 0) + p_value
                            WHEN p_change_type = 'set'     THEN p_value
                            ELSE COALESCE(sell_per_case, price_case, 0)
                        END, 2)) as new_price
                FROM public.products
                WHERE id = ANY(v_product_ids)
            )
            UPDATE public.products p SET
                sell_per_case = c.new_price,
                price_case = c.new_price
            FROM calc c
            WHERE p.id = c.id;
        END IF;
        GET DIAGNOSTICS v_base_updated = ROW_COUNT;
    END IF;

    -- Apply OVERRIDE updates safely
    IF p_apply_mode IN ('base_and_overrides', 'overrides_only') THEN
        IF p_vendor_ids IS NOT NULL AND array_length(p_vendor_ids, 1) > 0 THEN
            v_vendor_target_ids := p_vendor_ids;
        ELSE
            SELECT array_agg(vendor_id) INTO v_vendor_target_ids
            FROM public.distributor_vendors
            WHERE distributor_id = p_distributor_id;
        END IF;

        IF v_vendor_target_ids IS NOT NULL AND array_length(v_vendor_target_ids, 1) > 0 THEN
            INSERT INTO public.vendor_price_overrides (distributor_id, vendor_id, product_id, price_per_unit, price_per_case, price_cents, updated_at)
            SELECT
                p_distributor_id,
                v.vendor_id,
                p.id,
                -- New unit override calc
                CASE WHEN p_field = 'sell_price' THEN
                    GREATEST(0, ROUND(CASE
                        WHEN p_change_type = 'percent' THEN COALESCE(vpo.price_per_unit, vpo.price_cents / 100.0, p.sell_per_unit, p.sell_price, 0) * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN COALESCE(vpo.price_per_unit, vpo.price_cents / 100.0, p.sell_per_unit, p.sell_price, 0) + p_value
                        WHEN p_change_type = 'set'     THEN p_value
                        ELSE COALESCE(vpo.price_per_unit, vpo.price_cents / 100.0, p.sell_per_unit, p.sell_price, 0)
                    END, 2))
                ELSE vpo.price_per_unit END,
                -- New case override calc
                CASE WHEN p_field = 'price_case' THEN
                    GREATEST(0, ROUND(CASE
                        WHEN p_change_type = 'percent' THEN COALESCE(vpo.price_per_case, p.sell_per_case, p.price_case, 0) * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN COALESCE(vpo.price_per_case, p.sell_per_case, p.price_case, 0) + p_value
                        WHEN p_change_type = 'set'     THEN p_value
                        ELSE COALESCE(vpo.price_per_case, p.sell_per_case, p.price_case, 0)
                    END, 2))
                ELSE vpo.price_per_case END,
                -- Legacy fallback for cents
                0,
                now()
            FROM public.products p
            CROSS JOIN unnest(v_vendor_target_ids) AS v(vendor_id)
            LEFT JOIN public.vendor_price_overrides vpo ON p.id = vpo.product_id AND vpo.vendor_id = v.vendor_id
            WHERE p.id = ANY(v_product_ids)
            ON CONFLICT (distributor_id, vendor_id, product_id)
            DO UPDATE SET
                price_per_unit = excluded.price_per_unit,
                price_per_case = excluded.price_per_case,
                updated_at = now();

            GET DIAGNOSTICS v_overrides_upserted = ROW_COUNT;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'products_affected', COALESCE(array_length(v_product_ids, 1), 0),
        'base_updated', v_base_updated,
        'overrides_upserted', v_overrides_upserted
    );
END;
$$;
