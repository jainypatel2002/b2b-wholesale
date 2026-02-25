-- Ensure bulk case updates keep dependent unit prices synced atomically.
-- This wrapper calls bulk_adjust_prices and then synchronizes case->unit mirrors
-- for products and vendor overrides inside the same transaction.

create or replace function public.bulk_adjust_prices_atomic(
  p_distributor_id uuid,
  p_scope_type text,
  p_scope_id uuid,
  p_apply_mode text,
  p_vendor_ids uuid[] default null,
  p_change_type text default 'percent',
  p_value numeric default 0,
  p_field text default 'sell_price',
  p_price_unit text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
  v_requested_field text;
  v_field_key text;
  v_product_ids uuid[];
  v_vendor_target_ids uuid[];
begin
  v_result := public.bulk_adjust_prices(
    p_distributor_id,
    p_scope_type,
    p_scope_id,
    p_apply_mode,
    p_vendor_ids,
    p_change_type,
    p_value,
    p_field,
    p_price_unit
  );

  if (v_result::jsonb ? 'error') then
    return v_result;
  end if;

  v_requested_field := upper(trim(coalesce(p_field, '')));
  case
    when v_requested_field in ('SELL_CASE', 'PRICE_CASE') then v_field_key := 'price_case';
    when v_requested_field = 'COST_CASE' then v_field_key := 'cost_case';
    else return v_result;
  end case;

  if p_scope_type = 'category' then
    select array_agg(p.id)
      into v_product_ids
    from public.products p
    where p.distributor_id = p_distributor_id
      and p.deleted_at is null
      and p.category_id = p_scope_id;
  elsif p_scope_type = 'category_node' then
    with recursive node_tree as (
      select cn.id
      from public.category_nodes cn
      where cn.id = p_scope_id
        and cn.distributor_id = p_distributor_id
      union all
      select cn.id
      from public.category_nodes cn
      join node_tree nt on nt.id = cn.parent_id
      where cn.distributor_id = p_distributor_id
    )
    select array_agg(p.id)
      into v_product_ids
    from public.products p
    where p.distributor_id = p_distributor_id
      and p.deleted_at is null
      and p.category_node_id in (select id from node_tree);
  else
    return v_result;
  end if;

  if coalesce(array_length(v_product_ids, 1), 0) = 0 then
    return v_result;
  end if;

  if p_apply_mode in ('base_only', 'base_and_overrides') then
    if v_field_key = 'price_case' then
      update public.products p
      set
        sell_per_unit = case
          when coalesce(p.units_per_case, 0) > 0
               and coalesce(p.sell_per_case, p.price_case) is not null
            then round(coalesce(p.sell_per_case, p.price_case) / p.units_per_case::numeric, 2)
          else p.sell_per_unit
        end,
        sell_price = case
          when coalesce(p.units_per_case, 0) > 0
               and coalesce(p.sell_per_case, p.price_case) is not null
            then round(coalesce(p.sell_per_case, p.price_case) / p.units_per_case::numeric, 2)
          else p.sell_price
        end
      where p.id = any(v_product_ids);
    else
      update public.products p
      set
        cost_per_unit = case
          when coalesce(p.units_per_case, 0) > 0
               and coalesce(p.cost_per_case, p.cost_case) is not null
            then round(coalesce(p.cost_per_case, p.cost_case) / p.units_per_case::numeric, 2)
          else p.cost_per_unit
        end,
        cost_price = case
          when coalesce(p.units_per_case, 0) > 0
               and coalesce(p.cost_per_case, p.cost_case) is not null
            then round(coalesce(p.cost_per_case, p.cost_case) / p.units_per_case::numeric, 2)
          else p.cost_price
        end
      where p.id = any(v_product_ids);
    end if;
  end if;

  if v_field_key = 'price_case'
     and p_apply_mode in ('base_and_overrides', 'overrides_only') then
    if p_vendor_ids is not null and array_length(p_vendor_ids, 1) > 0 then
      select array_agg(dv.vendor_id)
        into v_vendor_target_ids
      from public.distributor_vendors dv
      where dv.distributor_id = p_distributor_id
        and dv.vendor_id = any(p_vendor_ids);
    else
      select array_agg(dv.vendor_id)
        into v_vendor_target_ids
      from public.distributor_vendors dv
      where dv.distributor_id = p_distributor_id;
    end if;

    if coalesce(array_length(v_vendor_target_ids, 1), 0) > 0 then
      with resolved as (
        select
          vpo.distributor_id,
          vpo.vendor_id,
          vpo.product_id,
          case
            when coalesce(p.units_per_case, 0) > 0 and vpo.price_per_case is not null
              then round(vpo.price_per_case / p.units_per_case::numeric, 2)
            else vpo.price_per_unit
          end as next_unit_price
        from public.vendor_price_overrides vpo
        join public.products p
          on p.id = vpo.product_id
         and p.distributor_id = vpo.distributor_id
        where vpo.distributor_id = p_distributor_id
          and vpo.product_id = any(v_product_ids)
          and vpo.vendor_id = any(v_vendor_target_ids)
      )
      update public.vendor_price_overrides vpo
      set
        price_per_unit = r.next_unit_price,
        price_cents = case
          when r.next_unit_price is not null
            then round(r.next_unit_price * 100)::integer
          else vpo.price_cents
        end,
        updated_at = now()
      from resolved r
      where vpo.distributor_id = r.distributor_id
        and vpo.vendor_id = r.vendor_id
        and vpo.product_id = r.product_id;
    end if;
  end if;

  return v_result;
end;
$$;
