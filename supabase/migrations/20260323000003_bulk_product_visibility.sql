-- Atomic bulk visibility updates for distributor inventory selection flows.

drop function if exists public.bulk_update_product_visibility(uuid, uuid[], text, uuid[]);

create or replace function public.bulk_update_product_visibility(
  p_distributor_id uuid,
  p_product_ids uuid[],
  p_operation text,
  p_vendor_ids uuid[] default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_product_ids uuid[] := array[]::uuid[];
  v_authorized_product_ids uuid[] := array[]::uuid[];
  v_requested_vendor_ids uuid[] := array[]::uuid[];
  v_valid_vendor_ids uuid[] := array[]::uuid[];
  v_total_selected integer := 0;
  v_authorized_count integer := 0;
  v_invalid_product_ids_count integer := 0;
  v_requested_vendor_count integer := 0;
  v_valid_vendor_count integer := 0;
  v_invalid_vendor_ids_count integer := 0;
  v_updated_count integer := 0;
  v_skipped_count integer := 0;
begin
  if auth.uid() is distinct from p_distributor_id then
    return json_build_object('error', 'Unauthorized: distributor mismatch');
  end if;

  if coalesce(trim(p_operation), '') not in ('set_visible', 'set_hidden', 'set_scope_all', 'set_selected_vendors') then
    return json_build_object('error', 'Invalid bulk visibility operation.');
  end if;

  select coalesce(array_agg(distinct requested.product_id order by requested.product_id), array[]::uuid[])
    into v_requested_product_ids
  from unnest(coalesce(p_product_ids, array[]::uuid[])) as requested(product_id)
  where requested.product_id is not null;

  v_total_selected := coalesce(array_length(v_requested_product_ids, 1), 0);

  if v_total_selected = 0 then
    return json_build_object(
      'success', true,
      'total_selected', 0,
      'updated_count', 0,
      'skipped_count', 0,
      'invalid_product_ids_count', 0,
      'invalid_vendor_ids_count', 0
    );
  end if;

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_authorized_product_ids
  from public.products p
  where p.distributor_id = p_distributor_id
    and p.deleted_at is null
    and p.id = any(v_requested_product_ids);

  v_authorized_count := coalesce(array_length(v_authorized_product_ids, 1), 0);
  v_invalid_product_ids_count := greatest(v_total_selected - v_authorized_count, 0);

  if p_operation = 'set_selected_vendors' then
    select coalesce(array_agg(distinct requested.vendor_id order by requested.vendor_id), array[]::uuid[])
      into v_requested_vendor_ids
    from unnest(coalesce(p_vendor_ids, array[]::uuid[])) as requested(vendor_id)
    where requested.vendor_id is not null;

    v_requested_vendor_count := coalesce(array_length(v_requested_vendor_ids, 1), 0);
    if v_requested_vendor_count = 0 then
      return json_build_object(
        'error', 'Select at least one linked vendor.',
        'total_selected', v_total_selected,
        'updated_count', 0,
        'skipped_count', v_authorized_count,
        'invalid_product_ids_count', v_invalid_product_ids_count,
        'invalid_vendor_ids_count', 0
      );
    end if;

    select coalesce(array_agg(dv.vendor_id order by dv.vendor_id), array[]::uuid[])
      into v_valid_vendor_ids
    from public.distributor_vendors dv
    where dv.distributor_id = p_distributor_id
      and dv.vendor_id = any(v_requested_vendor_ids);

    v_valid_vendor_count := coalesce(array_length(v_valid_vendor_ids, 1), 0);
    v_invalid_vendor_ids_count := greatest(v_requested_vendor_count - v_valid_vendor_count, 0);

    if v_invalid_vendor_ids_count > 0 then
      return json_build_object(
        'error', 'Only vendors linked to this distributor can be selected for product visibility.',
        'total_selected', v_total_selected,
        'updated_count', 0,
        'skipped_count', v_authorized_count,
        'invalid_product_ids_count', v_invalid_product_ids_count,
        'invalid_vendor_ids_count', v_invalid_vendor_ids_count
      );
    end if;
  end if;

  if v_authorized_count = 0 then
    return json_build_object(
      'success', true,
      'total_selected', v_total_selected,
      'updated_count', 0,
      'skipped_count', 0,
      'invalid_product_ids_count', v_invalid_product_ids_count,
      'invalid_vendor_ids_count', v_invalid_vendor_ids_count
    );
  end if;

  if p_operation = 'set_visible' then
    select count(*)
      into v_updated_count
    from public.products p
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null
      and coalesce(p.is_visible_to_vendors, true) is distinct from true;

    update public.products p
    set is_visible_to_vendors = true
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null;

  elsif p_operation = 'set_hidden' then
    select count(*)
      into v_updated_count
    from public.products p
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null
      and coalesce(p.is_visible_to_vendors, true) is distinct from false;

    update public.products p
    set is_visible_to_vendors = false
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null;

  elsif p_operation = 'set_scope_all' then
    select count(*)
      into v_updated_count
    from public.products p
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null
      and (
        coalesce(p.is_visible_to_vendors, true) is distinct from true
        or coalesce(nullif(p.vendor_visibility_scope, ''), 'all') is distinct from 'all'
      );

    update public.products p
    set
      is_visible_to_vendors = true,
      vendor_visibility_scope = 'all'
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null;

  elsif p_operation = 'set_selected_vendors' then
    with current_state as (
      select
        p.id,
        coalesce(p.is_visible_to_vendors, true) as is_visible_to_vendors,
        coalesce(nullif(p.vendor_visibility_scope, ''), 'all') as vendor_visibility_scope,
        coalesce(
          array_agg(distinct pvv.vendor_id order by pvv.vendor_id) filter (where pvv.vendor_id is not null),
          array[]::uuid[]
        ) as current_vendor_ids
      from public.products p
      left join public.product_vendor_visibility pvv
        on pvv.distributor_id = p.distributor_id
       and pvv.product_id = p.id
      where p.id = any(v_authorized_product_ids)
        and p.distributor_id = p_distributor_id
        and p.deleted_at is null
      group by p.id, p.is_visible_to_vendors, p.vendor_visibility_scope
    )
    select count(*)
      into v_updated_count
    from current_state cs
    where cs.is_visible_to_vendors is distinct from true
       or cs.vendor_visibility_scope is distinct from 'selected'
       or cs.current_vendor_ids is distinct from v_valid_vendor_ids;

    delete from public.product_vendor_visibility pvv
    where pvv.distributor_id = p_distributor_id
      and pvv.product_id = any(v_authorized_product_ids)
      and not (pvv.vendor_id = any(v_valid_vendor_ids));

    insert into public.product_vendor_visibility (
      distributor_id,
      vendor_id,
      product_id
    )
    select
      p_distributor_id,
      vendor_target.vendor_id,
      product_target.product_id
    from unnest(v_authorized_product_ids) as product_target(product_id)
    cross join unnest(v_valid_vendor_ids) as vendor_target(vendor_id)
    on conflict (distributor_id, vendor_id, product_id) do nothing;

    update public.products p
    set
      is_visible_to_vendors = true,
      vendor_visibility_scope = 'selected'
    where p.id = any(v_authorized_product_ids)
      and p.distributor_id = p_distributor_id
      and p.deleted_at is null;
  end if;

  v_skipped_count := greatest(v_authorized_count - v_updated_count, 0);

  return json_build_object(
    'success', true,
    'total_selected', v_total_selected,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count,
    'invalid_product_ids_count', v_invalid_product_ids_count,
    'invalid_vendor_ids_count', v_invalid_vendor_ids_count
  );
end;
$$;

revoke all on function public.bulk_update_product_visibility(uuid, uuid[], text, uuid[]) from public;
grant execute on function public.bulk_update_product_visibility(uuid, uuid[], text, uuid[]) to authenticated;
grant execute on function public.bulk_update_product_visibility(uuid, uuid[], text, uuid[]) to service_role;
