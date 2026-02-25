-- 20260313000001_bulk_pricing_cost_targets.sql
-- Add explicit cost unit/case bulk field targets while preserving legacy COST behavior.

alter table public.products
  add column if not exists cost_per_unit numeric(10,4),
  add column if not exists cost_per_case numeric(10,4),
  add column if not exists cost_case numeric;

update public.products
set cost_per_unit = coalesce(cost_per_unit, cost_price)
where cost_per_unit is null and cost_price is not null;

update public.products
set cost_per_case = coalesce(cost_per_case, cost_case)
where cost_per_case is null and cost_case is not null;

update public.products
set cost_price = coalesce(cost_price, cost_per_unit)
where cost_price is null and cost_per_unit is not null;

update public.products
set cost_case = coalesce(cost_case, cost_per_case)
where cost_case is null and cost_per_case is not null;

create or replace function public.bulk_adjust_prices(
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
  v_price_unit text;
  v_field_key text;
  v_field_target text;
  v_requested_field text;
  v_product_ids uuid[];
  v_vendor_target_ids uuid[];
  v_products_affected integer := 0;
  v_base_updated integer := 0;
  v_overrides_upserted integer := 0;
  v_invalid_count integer := 0;
  v_invalid_products text[];
begin
  if auth.uid() is distinct from p_distributor_id then
    return json_build_object('error', 'Unauthorized: distributor mismatch');
  end if;

  if p_scope_type not in ('category', 'category_node') then
    return json_build_object('error', 'Invalid scope_type');
  end if;
  if p_apply_mode not in ('base_only', 'base_and_overrides', 'overrides_only') then
    return json_build_object('error', 'Invalid apply_mode');
  end if;
  if p_change_type not in ('percent', 'fixed', 'set') then
    return json_build_object('error', 'Invalid change_type');
  end if;
  if p_value is null then
    return json_build_object('error', 'Invalid value');
  end if;

  v_requested_field := trim(coalesce(p_field, ''));
  if v_requested_field = '' then
    return json_build_object('error', 'Invalid field');
  end if;

  case
    when upper(v_requested_field) in ('SELL_UNIT', 'SELL_PRICE') then
      v_field_key := 'sell_price';
      v_field_target := 'SELL_UNIT';
    when upper(v_requested_field) in ('SELL_CASE', 'PRICE_CASE') then
      v_field_key := 'price_case';
      v_field_target := 'SELL_CASE';
    when upper(v_requested_field) in ('COST', 'COST_UNIT', 'COST_PRICE') then
      v_field_key := 'cost_price';
      v_field_target := 'COST_UNIT';
    when upper(v_requested_field) = 'COST_CASE' then
      v_field_key := 'cost_case';
      v_field_target := 'COST_CASE';
    else
      return json_build_object('error', 'Invalid field');
  end case;

  v_price_unit := coalesce(
    p_price_unit,
    case
      when v_field_key in ('price_case', 'cost_case') then 'case'
      else 'unit'
    end
  );

  if v_price_unit not in ('unit', 'case') then
    return json_build_object('error', 'Invalid price_unit');
  end if;

  if v_field_key = 'sell_price' and v_price_unit <> 'unit' then
    return json_build_object('error', 'Field sell_price requires price_unit=unit');
  end if;
  if v_field_key = 'price_case' and v_price_unit <> 'case' then
    return json_build_object('error', 'Field price_case requires price_unit=case');
  end if;
  if v_field_key = 'cost_price' and v_price_unit <> 'unit' then
    return json_build_object('error', 'Field cost_price requires price_unit=unit');
  end if;
  if v_field_key = 'cost_case' and v_price_unit <> 'case' then
    return json_build_object('error', 'Field cost_case requires price_unit=case');
  end if;

  if p_scope_type = 'category' then
    select array_agg(p.id)
      into v_product_ids
    from public.products p
    where p.distributor_id = p_distributor_id
      and p.deleted_at is null
      and p.category_id = p_scope_id;
  else
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
  end if;

  v_products_affected := coalesce(array_length(v_product_ids, 1), 0);
  if v_products_affected = 0 then
    return json_build_object(
      'success', true,
      'field_target', v_field_target,
      'field_key', v_field_key,
      'price_unit', v_price_unit,
      'products_affected', 0,
      'base_updated', 0,
      'overrides_upserted', 0
    );
  end if;

  if v_field_key = 'price_case' then
    select array_agg(format('%s (%s)', p.name, p.id::text))
      into v_invalid_products
    from public.products p
    where p.id = any(v_product_ids)
      and coalesce(p.allow_case, false) = false;

    if coalesce(array_length(v_invalid_products, 1), 0) > 0 then
      return json_build_object(
        'error', 'Cannot apply case pricing to products where allow_case is false',
        'invalid_products', v_invalid_products
      );
    end if;

    select array_agg(format('%s (%s)', p.name, p.id::text))
      into v_invalid_products
    from public.products p
    where p.id = any(v_product_ids)
      and coalesce(p.units_per_case, 0) < 1;

    if coalesce(array_length(v_invalid_products, 1), 0) > 0 then
      return json_build_object(
        'error', 'Cannot apply case pricing: units_per_case must be at least 1 for all targeted products',
        'invalid_products', v_invalid_products
      );
    end if;
  end if;

  if p_apply_mode in ('base_only', 'base_and_overrides') then
    if v_field_key = 'sell_price' then
      if p_change_type in ('percent', 'fixed') and exists (
        select 1
        from public.products p
        where p.id = any(v_product_ids)
          and coalesce(p.sell_per_unit, p.sell_price) is null
      ) then
        return json_build_object('error', 'Cannot apply percent/fixed: some products have no unit sell price');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(p.sell_per_unit, p.sell_price) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(p.sell_per_unit, p.sell_price)
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      select count(*)
        into v_invalid_count
      from calc
      where new_value < 0;

      if v_invalid_count > 0 then
        return json_build_object('error', 'Bulk update rejected: resulting sell prices would be negative');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(p.sell_per_unit, p.sell_price) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(p.sell_per_unit, p.sell_price)
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      update public.products p
      set
        sell_per_unit = c.new_value,
        sell_price = c.new_value
      from calc c
      where p.id = c.id;

      get diagnostics v_base_updated = row_count;

    elsif v_field_key = 'price_case' then
      if p_change_type in ('percent', 'fixed') and exists (
        select 1
        from public.products p
        where p.id = any(v_product_ids)
          and coalesce(p.sell_per_case, p.price_case) is null
      ) then
        return json_build_object('error', 'Cannot apply percent/fixed: some products have no case sell price');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(p.sell_per_case, p.price_case) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(p.sell_per_case, p.price_case) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(p.sell_per_case, p.price_case)
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      select count(*)
        into v_invalid_count
      from calc
      where new_value < 0;

      if v_invalid_count > 0 then
        return json_build_object('error', 'Bulk update rejected: resulting case prices would be negative');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(p.sell_per_case, p.price_case) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(p.sell_per_case, p.price_case) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(p.sell_per_case, p.price_case)
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      update public.products p
      set
        sell_per_case = c.new_value,
        price_case = c.new_value
      from calc c
      where p.id = c.id;

      get diagnostics v_base_updated = row_count;

    elsif v_field_key = 'cost_price' then
      if p_change_type in ('percent', 'fixed') and exists (
        select 1
        from public.products p
        where p.id = any(v_product_ids)
          and coalesce(p.cost_per_unit, p.cost_price) is null
      ) then
        return json_build_object('error', 'Cannot apply percent/fixed: some products have no unit cost');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(p.cost_per_unit, p.cost_price) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(p.cost_per_unit, p.cost_price) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(p.cost_per_unit, p.cost_price)
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      select count(*)
        into v_invalid_count
      from calc
      where new_value < 0;

      if v_invalid_count > 0 then
        return json_build_object('error', 'Bulk update rejected: resulting costs would be negative');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(p.cost_per_unit, p.cost_price) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(p.cost_per_unit, p.cost_price) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(p.cost_per_unit, p.cost_price)
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      update public.products p
      set
        cost_per_unit = c.new_value,
        cost_price = c.new_value
      from calc c
      where p.id = c.id;

      get diagnostics v_base_updated = row_count;

    elsif v_field_key = 'cost_case' then
      if p_change_type in ('percent', 'fixed') and exists (
        select 1
        from public.products p
        where p.id = any(v_product_ids)
          and coalesce(
            p.cost_per_case,
            p.cost_case,
            case
              when coalesce(p.units_per_case, 0) > 0
                   and coalesce(p.cost_per_unit, p.cost_price) is not null
                then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
            end
          ) is null
      ) then
        return json_build_object('error', 'Cannot apply percent/fixed: some products have no case cost');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(
                p.cost_per_case,
                p.cost_case,
                case
                  when coalesce(p.units_per_case, 0) > 0
                       and coalesce(p.cost_per_unit, p.cost_price) is not null
                    then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
                end
              ) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(
                p.cost_per_case,
                p.cost_case,
                case
                  when coalesce(p.units_per_case, 0) > 0
                       and coalesce(p.cost_per_unit, p.cost_price) is not null
                    then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
                end
              ) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(
                p.cost_per_case,
                p.cost_case,
                case
                  when coalesce(p.units_per_case, 0) > 0
                       and coalesce(p.cost_per_unit, p.cost_price) is not null
                    then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
                end
              )
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      select count(*)
        into v_invalid_count
      from calc
      where new_value < 0;

      if v_invalid_count > 0 then
        return json_build_object('error', 'Bulk update rejected: resulting case costs would be negative');
      end if;

      with calc as (
        select
          p.id,
          round(
            case
              when p_change_type = 'percent' then coalesce(
                p.cost_per_case,
                p.cost_case,
                case
                  when coalesce(p.units_per_case, 0) > 0
                       and coalesce(p.cost_per_unit, p.cost_price) is not null
                    then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
                end
              ) * (1 + p_value / 100)
              when p_change_type = 'fixed' then coalesce(
                p.cost_per_case,
                p.cost_case,
                case
                  when coalesce(p.units_per_case, 0) > 0
                       and coalesce(p.cost_per_unit, p.cost_price) is not null
                    then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
                end
              ) + p_value
              when p_change_type = 'set' then p_value
              else coalesce(
                p.cost_per_case,
                p.cost_case,
                case
                  when coalesce(p.units_per_case, 0) > 0
                       and coalesce(p.cost_per_unit, p.cost_price) is not null
                    then coalesce(p.cost_per_unit, p.cost_price) * p.units_per_case::numeric
                end
              )
            end,
            4
          ) as new_value
        from public.products p
        where p.id = any(v_product_ids)
      )
      update public.products p
      set
        cost_per_case = c.new_value,
        cost_case = c.new_value
      from calc c
      where p.id = c.id;

      get diagnostics v_base_updated = row_count;
    end if;
  end if;

  if p_apply_mode in ('base_and_overrides', 'overrides_only')
     and v_field_key in ('sell_price', 'price_case') then
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
      if v_field_key = 'sell_price' then
        if p_apply_mode = 'overrides_only' and p_change_type in ('percent', 'fixed') and exists (
          select 1
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
            and coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price) is null
        ) then
          return json_build_object('error', 'Cannot apply percent/fixed overrides: missing unit price baseline');
        end if;

        with calculated as (
          select
            p.id as product_id,
            v.vendor_id,
            vpo.price_per_case as existing_case_price,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_unit, p.sell_price)
                when p_change_type = 'percent' then coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price)
              end,
              4
            ) as new_unit_price
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
        )
        select count(*)
          into v_invalid_count
        from calculated
        where new_unit_price < 0;

        if v_invalid_count > 0 then
          return json_build_object('error', 'Bulk override rejected: resulting unit override prices would be negative');
        end if;

        insert into public.vendor_price_overrides (
          distributor_id,
          vendor_id,
          product_id,
          price_per_unit,
          price_per_case,
          price_cents,
          updated_at
        )
        select
          p_distributor_id,
          c.vendor_id,
          c.product_id,
          c.new_unit_price,
          c.existing_case_price,
          round(c.new_unit_price * 100)::integer,
          now()
        from (
          select
            p.id as product_id,
            v.vendor_id,
            vpo.price_per_case as existing_case_price,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_unit, p.sell_price)
                when p_change_type = 'percent' then coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_unit, p.sell_per_unit, p.sell_price)
              end,
              4
            ) as new_unit_price
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
        ) c
        on conflict (distributor_id, vendor_id, product_id)
        do update set
          price_per_unit = excluded.price_per_unit,
          price_cents = excluded.price_cents,
          updated_at = now();

        get diagnostics v_overrides_upserted = row_count;

      elsif v_field_key = 'price_case' then
        if p_apply_mode = 'overrides_only' and p_change_type in ('percent', 'fixed') and exists (
          select 1
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
            and coalesce(vpo.price_per_case, p.sell_per_case, p.price_case) is null
        ) then
          return json_build_object('error', 'Cannot apply percent/fixed overrides: missing case price baseline');
        end if;

        with calculated as (
          select
            p.id as product_id,
            v.vendor_id,
            vpo.price_per_unit as existing_unit_price,
            vpo.price_cents as existing_price_cents,
            coalesce(p.sell_per_unit, p.sell_price) as base_unit_price,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_case, p.price_case)
                when p_change_type = 'percent' then coalesce(vpo.price_per_case, p.sell_per_case, p.price_case) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(vpo.price_per_case, p.sell_per_case, p.price_case) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_case, p.sell_per_case, p.price_case)
              end,
              4
            ) as new_case_price
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
        )
        select count(*)
          into v_invalid_count
        from calculated
        where new_case_price < 0;

        if v_invalid_count > 0 then
          return json_build_object('error', 'Bulk override rejected: resulting case override prices would be negative');
        end if;

        insert into public.vendor_price_overrides (
          distributor_id,
          vendor_id,
          product_id,
          price_per_unit,
          price_per_case,
          price_cents,
          updated_at
        )
        select
          p_distributor_id,
          c.vendor_id,
          c.product_id,
          c.existing_unit_price,
          c.new_case_price,
          coalesce(
            c.existing_price_cents,
            round(coalesce(c.existing_unit_price, c.base_unit_price, 0) * 100)::integer
          ),
          now()
        from (
          select
            p.id as product_id,
            v.vendor_id,
            vpo.price_per_unit as existing_unit_price,
            vpo.price_cents as existing_price_cents,
            coalesce(p.sell_per_unit, p.sell_price) as base_unit_price,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_case, p.price_case)
                when p_change_type = 'percent' then coalesce(vpo.price_per_case, p.sell_per_case, p.price_case) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(vpo.price_per_case, p.sell_per_case, p.price_case) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_case, p.sell_per_case, p.price_case)
              end,
              4
            ) as new_case_price
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
        ) c
        on conflict (distributor_id, vendor_id, product_id)
        do update set
          price_per_case = excluded.price_per_case,
          price_cents = coalesce(public.vendor_price_overrides.price_cents, excluded.price_cents),
          updated_at = now();

        get diagnostics v_overrides_upserted = row_count;
      end if;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'field_target', v_field_target,
    'field_key', v_field_key,
    'price_unit', v_price_unit,
    'products_affected', v_products_affected,
    'base_updated', v_base_updated,
    'overrides_upserted', v_overrides_upserted
  );
end;
$$;
