-- Bulk Price Adjustment RPC
-- Replaces broken execute_bulk_price_adjustment with correct column names and enhanced functionality

-- Drop the old broken RPC
drop function if exists execute_bulk_price_adjustment(uuid, text, uuid, text, numeric);

-- Create the new bulk_adjust_prices RPC
create or replace function public.bulk_adjust_prices(
    p_distributor_id uuid,
    p_scope_type text,          -- 'category' | 'category_node'
    p_scope_id uuid,            -- ID of the selected category or node
    p_apply_mode text,          -- 'base_only' | 'base_and_overrides' | 'overrides_only'
    p_vendor_ids uuid[] default null,  -- vendor IDs for override modes (null = all linked)
    p_change_type text default 'percent',  -- 'percent' | 'fixed' | 'set'
    p_value numeric default 0,
    p_field text default 'sell_price'      -- 'sell_price' | 'price_case' | 'cost_price'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_base_updated integer := 0;
    v_overrides_upserted integer := 0;
    v_product_ids uuid[];
    v_vendor_target_ids uuid[];
begin
    -- 1. Authorization: caller must be the distributor
    if p_distributor_id != auth.uid() then
        return json_build_object('error', 'Unauthorized: distributor mismatch');
    end if;

    -- 2. Validate inputs
    if p_scope_type not in ('category', 'category_node') then
        return json_build_object('error', 'Invalid scope_type');
    end if;
    if p_apply_mode not in ('base_only', 'base_and_overrides', 'overrides_only') then
        return json_build_object('error', 'Invalid apply_mode');
    end if;
    if p_change_type not in ('percent', 'fixed', 'set') then
        return json_build_object('error', 'Invalid change_type');
    end if;
    if p_field not in ('sell_price', 'price_case', 'cost_price') then
        return json_build_object('error', 'Invalid field');
    end if;

    -- 3. Resolve product IDs in scope
    if p_scope_type = 'category' then
        -- All products in the category (any category_node under it)
        select array_agg(id) into v_product_ids
        from public.products
        where distributor_id = p_distributor_id
          and category_id = p_scope_id
          and deleted_at is null;

    elsif p_scope_type = 'category_node' then
        -- Products in this node + all descendant nodes (recursive)
        with recursive node_tree as (
            select id from public.category_nodes
            where id = p_scope_id and distributor_id = p_distributor_id
            union all
            select cn.id from public.category_nodes cn
            inner join node_tree nt on cn.parent_id = nt.id
        )
        select array_agg(p.id) into v_product_ids
        from public.products p
        where p.distributor_id = p_distributor_id
          and p.category_node_id in (select id from node_tree)
          and p.deleted_at is null;
    end if;

    -- Guard: no products found
    if v_product_ids is null or array_length(v_product_ids, 1) is null then
        return json_build_object('success', true, 'products_affected', 0, 'base_updated', 0, 'overrides_upserted', 0);
    end if;

    -- 4. Apply BASE price updates (when mode includes base)
    if p_apply_mode in ('base_only', 'base_and_overrides') then
        if p_field = 'sell_price' then
            update public.products set
                sell_price = case
                    when p_change_type = 'percent' then round(sell_price * (1.0 + p_value / 100.0), 2)
                    when p_change_type = 'fixed'   then round(sell_price + p_value, 2)
                    when p_change_type = 'set'     then round(p_value, 2)
                    else sell_price
                end
            where id = any(v_product_ids);
        elsif p_field = 'price_case' then
            update public.products set
                price_case = case
                    when p_change_type = 'percent' then round(coalesce(price_case, 0) * (1.0 + p_value / 100.0), 2)
                    when p_change_type = 'fixed'   then round(coalesce(price_case, 0) + p_value, 2)
                    when p_change_type = 'set'     then round(p_value, 2)
                    else price_case
                end
            where id = any(v_product_ids);
        elsif p_field = 'cost_price' then
            update public.products set
                cost_price = case
                    when p_change_type = 'percent' then round(cost_price * (1.0 + p_value / 100.0), 2)
                    when p_change_type = 'fixed'   then round(cost_price + p_value, 2)
                    when p_change_type = 'set'     then round(p_value, 2)
                    else cost_price
                end
            where id = any(v_product_ids);
        end if;

        get diagnostics v_base_updated = row_count;
    end if;

    -- 5. Apply OVERRIDE updates (when mode includes overrides)
    if p_apply_mode in ('base_and_overrides', 'overrides_only') then
        -- Resolve vendor targets
        if p_vendor_ids is not null and array_length(p_vendor_ids, 1) > 0 then
            v_vendor_target_ids := p_vendor_ids;
        else
            -- All linked vendors
            select array_agg(vendor_id) into v_vendor_target_ids
            from public.distributor_vendors
            where distributor_id = p_distributor_id;
        end if;

        if v_vendor_target_ids is not null and array_length(v_vendor_target_ids, 1) > 0 then
            -- For overrides, we need the NEW effective price in cents.
            -- We compute it from the (now-updated) base product price.
            -- For 'overrides_only' mode, we compute the adjusted price without changing base.
            insert into public.vendor_price_overrides (distributor_id, vendor_id, product_id, price_cents, updated_at)
            select
                p_distributor_id,
                v.vendor_id,
                p.id,
                case
                    when p_apply_mode = 'base_and_overrides' then
                        -- Sync override to match the new base price (already updated above)
                        case p_field
                            when 'sell_price' then round(p.sell_price * 100)::integer
                            when 'price_case' then round(coalesce(p.price_case, 0) * 100)::integer
                            when 'cost_price' then round(p.cost_price * 100)::integer
                            else round(p.sell_price * 100)::integer
                        end
                    when p_apply_mode = 'overrides_only' then
                        -- Compute new override price from current base (base NOT changed)
                        case p_field
                            when 'sell_price' then
                                case p_change_type
                                    when 'percent' then round(p.sell_price * (1.0 + p_value / 100.0) * 100)::integer
                                    when 'fixed'   then round((p.sell_price + p_value) * 100)::integer
                                    when 'set'     then round(p_value * 100)::integer
                                    else round(p.sell_price * 100)::integer
                                end
                            when 'price_case' then
                                case p_change_type
                                    when 'percent' then round(coalesce(p.price_case, 0) * (1.0 + p_value / 100.0) * 100)::integer
                                    when 'fixed'   then round((coalesce(p.price_case, 0) + p_value) * 100)::integer
                                    when 'set'     then round(p_value * 100)::integer
                                    else round(coalesce(p.price_case, 0) * 100)::integer
                                end
                            when 'cost_price' then
                                case p_change_type
                                    when 'percent' then round(p.cost_price * (1.0 + p_value / 100.0) * 100)::integer
                                    when 'fixed'   then round((p.cost_price + p_value) * 100)::integer
                                    when 'set'     then round(p_value * 100)::integer
                                    else round(p.cost_price * 100)::integer
                                end
                            else round(p.sell_price * 100)::integer
                        end
                    else round(p.sell_price * 100)::integer
                end,
                now()
            from public.products p
            cross join unnest(v_vendor_target_ids) as v(vendor_id)
            where p.id = any(v_product_ids)
            on conflict (distributor_id, vendor_id, product_id)
            do update set
                price_cents = excluded.price_cents,
                updated_at = now();

            get diagnostics v_overrides_upserted = row_count;
        end if;
    end if;

    return json_build_object(
        'success', true,
        'products_affected', coalesce(array_length(v_product_ids, 1), 0),
        'base_updated', v_base_updated,
        'overrides_upserted', v_overrides_upserted
    );
end;
$$;
