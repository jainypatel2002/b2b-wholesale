-- 20260308000002_pricing_pipeline_consistency.sql
-- Canonical pricing + override consistency for bulk updates and vendor catalog reads.

-- 1) Ensure canonical override columns/constraints are present
alter table public.vendor_price_overrides
  add column if not exists price_per_unit numeric(10,4),
  add column if not exists price_per_case numeric(10,4);

update public.vendor_price_overrides
set price_per_unit = price_cents::numeric / 100.0
where price_per_unit is null
  and price_cents is not null;

create unique index if not exists vendor_price_overrides_dist_vendor_product_uidx
  on public.vendor_price_overrides(distributor_id, vendor_id, product_id);

create index if not exists vendor_price_overrides_vendor_product_idx
  on public.vendor_price_overrides(vendor_id, product_id);

alter table public.vendor_price_overrides enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_price_overrides'
      and policyname = 'Vendor price overrides: distributor full access'
  ) then
    execute $policy$
      create policy "Vendor price overrides: distributor full access"
      on public.vendor_price_overrides
      for all
      using (auth.uid() = distributor_id)
      with check (auth.uid() = distributor_id)
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_price_overrides'
      and policyname = 'Vendor price overrides: vendor read own'
  ) then
    execute $policy$
      create policy "Vendor price overrides: vendor read own"
      on public.vendor_price_overrides
      for select
      using (auth.uid() = vendor_id)
    $policy$;
  end if;
end $$;

-- 2) Vendor catalog RPC: always return canonical fields and legacy fallback for unit override
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
  order by p.name asc;
end;
$$;

grant execute on function public.get_vendor_catalog_prices(uuid) to authenticated;
grant execute on function public.get_vendor_catalog_prices(uuid) to service_role;

-- 3) Atomic bulk pricing RPC with strict validation and canonical+legacy sync
create or replace function public.bulk_adjust_prices(
  p_distributor_id uuid,
  p_scope_type text,
  p_scope_id uuid,
  p_apply_mode text,
  p_vendor_ids uuid[] default null,
  p_change_type text default 'percent',
  p_value numeric default 0,
  p_field text default 'sell_price'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_ids uuid[];
  v_vendor_target_ids uuid[];
  v_products_affected integer := 0;
  v_base_updated integer := 0;
  v_overrides_upserted integer := 0;
  v_invalid_count integer := 0;
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
  if p_field not in ('sell_price', 'price_case', 'cost_price') then
    return json_build_object('error', 'Invalid field');
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
      'products_affected', 0,
      'base_updated', 0,
      'overrides_upserted', 0
    );
  end if;

  if p_apply_mode in ('base_only', 'base_and_overrides') then
    if p_field = 'sell_price' then
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
      select count(*) into v_invalid_count from calc where new_value < 0;

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

    elsif p_field = 'price_case' then
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
      select count(*) into v_invalid_count from calc where new_value < 0;

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

    elsif p_field = 'cost_price' then
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
      select count(*) into v_invalid_count from calc where new_value < 0;

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
    end if;
  end if;

  if p_apply_mode in ('base_and_overrides', 'overrides_only') and p_field in ('sell_price', 'price_case') then
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
      if p_field = 'sell_price' then
        if p_apply_mode = 'overrides_only' and p_change_type in ('percent', 'fixed') and exists (
          select 1
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
            and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) is null
        ) then
          return json_build_object('error', 'Cannot apply percent/fixed overrides: missing unit price baseline');
        end if;

        with calculated as (
          select
            p.id as product_id,
            v.vendor_id,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_unit, p.sell_price)
                when p_change_type = 'percent' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price)
              end,
              4
            ) as new_unit_price,
            coalesce(vpo.price_per_case,
              case when coalesce(p.units_per_case, 1) > 1 then round(
                (
                  case
                    when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_unit, p.sell_price)
                    when p_change_type = 'percent' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
                    when p_change_type = 'fixed' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) + p_value
                    when p_change_type = 'set' then p_value
                    else coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price)
                  end
                ) * p.units_per_case::numeric, 4)
              else null end
            ) as existing_or_derived_case
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
        )
        select count(*) into v_invalid_count from calculated where new_unit_price < 0;

        if v_invalid_count > 0 then
          return json_build_object('error', 'Bulk override rejected: resulting override prices would be negative');
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
          c.existing_or_derived_case,
          round(c.new_unit_price * 100)::integer,
          now()
        from (
          select
            p.id as product_id,
            v.vendor_id,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_unit, p.sell_price)
                when p_change_type = 'percent' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price)
              end,
              4
            ) as new_unit_price,
            coalesce(vpo.price_per_case,
              case when coalesce(p.units_per_case, 1) > 1 then round(
                (
                  case
                    when p_apply_mode = 'base_and_overrides' then coalesce(p.sell_per_unit, p.sell_price)
                    when p_change_type = 'percent' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) * (1 + p_value / 100)
                    when p_change_type = 'fixed' then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price) + p_value
                    when p_change_type = 'set' then p_value
                    else coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0), p.sell_per_unit, p.sell_price)
                  end
                ) * p.units_per_case::numeric, 4)
              else null end
            ) as existing_or_derived_case
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
          price_per_case = coalesce(excluded.price_per_case, public.vendor_price_overrides.price_per_case),
          price_cents = excluded.price_cents,
          updated_at = now();

        get diagnostics v_overrides_upserted = row_count;

      elsif p_field = 'price_case' then
        if p_apply_mode = 'overrides_only' and p_change_type in ('percent', 'fixed') and exists (
          select 1
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
            and coalesce(
              vpo.price_per_case,
              case when coalesce(p.units_per_case, 1) > 1 and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) is not null
                then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) * p.units_per_case::numeric end,
              p.sell_per_case,
              p.price_case,
              case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
            ) is null
        ) then
          return json_build_object('error', 'Cannot apply percent/fixed overrides: missing case price baseline');
        end if;

        with calculated as (
          select
            p.id as product_id,
            v.vendor_id,
            coalesce(p.units_per_case, 1) as units_per_case,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(
                  p.sell_per_case,
                  p.price_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                    then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
                )
                when p_change_type = 'percent' then coalesce(
                  vpo.price_per_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) is not null
                    then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) * p.units_per_case::numeric end,
                  p.sell_per_case,
                  p.price_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                    then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
                ) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(
                  vpo.price_per_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) is not null
                    then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) * p.units_per_case::numeric end,
                  p.sell_per_case,
                  p.price_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                    then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
                ) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_case, p.sell_per_case, p.price_case)
              end,
              4
            ) as new_case_price,
            vpo.price_per_unit as existing_unit_price,
            vpo.price_cents as existing_price_cents
          from public.products p
          cross join unnest(v_vendor_target_ids) as v(vendor_id)
          left join public.vendor_price_overrides vpo
            on vpo.distributor_id = p_distributor_id
           and vpo.vendor_id = v.vendor_id
           and vpo.product_id = p.id
          where p.id = any(v_product_ids)
        )
        select count(*) into v_invalid_count from calculated where new_case_price < 0;

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
          coalesce(
            c.existing_unit_price,
            case when c.units_per_case > 1 then round(c.new_case_price / c.units_per_case::numeric, 4) end
          ) as price_per_unit,
          c.new_case_price,
          coalesce(
            round(coalesce(
              c.existing_unit_price,
              case when c.units_per_case > 1 then c.new_case_price / c.units_per_case::numeric end
            ) * 100)::integer,
            c.existing_price_cents
          ) as price_cents,
          now()
        from (
          select
            p.id as product_id,
            v.vendor_id,
            coalesce(p.units_per_case, 1) as units_per_case,
            round(
              case
                when p_apply_mode = 'base_and_overrides' then coalesce(
                  p.sell_per_case,
                  p.price_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                    then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
                )
                when p_change_type = 'percent' then coalesce(
                  vpo.price_per_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) is not null
                    then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) * p.units_per_case::numeric end,
                  p.sell_per_case,
                  p.price_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                    then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
                ) * (1 + p_value / 100)
                when p_change_type = 'fixed' then coalesce(
                  vpo.price_per_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) is not null
                    then coalesce(vpo.price_per_unit, (vpo.price_cents::numeric / 100.0)) * p.units_per_case::numeric end,
                  p.sell_per_case,
                  p.price_case,
                  case when coalesce(p.units_per_case, 1) > 1 and coalesce(p.sell_per_unit, p.sell_price) is not null
                    then coalesce(p.sell_per_unit, p.sell_price) * p.units_per_case::numeric end
                ) + p_value
                when p_change_type = 'set' then p_value
                else coalesce(vpo.price_per_case, p.sell_per_case, p.price_case)
              end,
              4
            ) as new_case_price,
            vpo.price_per_unit as existing_unit_price,
            vpo.price_cents as existing_price_cents
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
          price_per_unit = coalesce(excluded.price_per_unit, public.vendor_price_overrides.price_per_unit),
          price_per_case = excluded.price_per_case,
          price_cents = coalesce(excluded.price_cents, public.vendor_price_overrides.price_cents),
          updated_at = now();

        get diagnostics v_overrides_upserted = row_count;
      end if;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'products_affected', v_products_affected,
    'base_updated', v_base_updated,
    'overrides_upserted', v_overrides_upserted
  );
end;
$$;
