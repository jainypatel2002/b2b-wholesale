-- Add safe delete columns
alter table products add column if not exists is_active boolean default true;
alter table products add column if not exists deleted_at timestamptz;
alter table products add column if not exists deleted_reason text;

alter table categories add column if not exists is_active boolean default true;
alter table categories add column if not exists deleted_at timestamptz;

alter table subcategories add column if not exists is_active boolean default true;
alter table subcategories add column if not exists deleted_at timestamptz;

-- Add snapshot column to order_items for historical accuracy
alter table order_items add column if not exists product_name text;

-- RPC: Archive Subcategory
create or replace function archive_subcategory(p_subcategory_id uuid)
returns json
language plpgsql
security definer
as $$
declare
    v_count int;
begin
    -- Verify ownership
    if not exists (
        select 1 from subcategories
        where id = p_subcategory_id and distributor_id = auth.uid()
    ) then
        return json_build_object('error', 'Unauthorized or not found');
    end if;

    -- Archive products
    with archived_products as (
        update products
        set is_active = false,
            deleted_at = now(),
            deleted_reason = 'subcategory_archived'
        where subcategory_id = p_subcategory_id
          and distributor_id = auth.uid()
          and deleted_at is null
        returning id
    )
    select count(*) into v_count from archived_products;

    -- Archive subcategory
    update subcategories
    set is_active = false,
        deleted_at = now()
    where id = p_subcategory_id;

    return json_build_object('success', true, 'archived_products', v_count);
end;
$$;

-- RPC: Archive Category
create or replace function archive_category(p_category_id uuid)
returns json
language plpgsql
security definer
as $$
declare
    v_prod_count int;
    v_sub_count int;
begin
    -- Verify ownership
    if not exists (
        select 1 from categories
        where id = p_category_id and distributor_id = auth.uid()
    ) then
        return json_build_object('error', 'Unauthorized or not found');
    end if;

    -- Archive products (direct or via subcategories)
    with archived_products as (
        update products
        set is_active = false,
            deleted_at = now(),
            deleted_reason = 'category_archived'
        where category_id = p_category_id
          and distributor_id = auth.uid()
          and deleted_at is null
        returning id
    )
    select count(*) into v_prod_count from archived_products;

    -- Archive subcategories
    with archived_subs as (
        update subcategories
        set is_active = false,
            deleted_at = now()
        where category_id = p_category_id
          and distributor_id = auth.uid()
          and deleted_at is null
        returning id
    )
    select count(*) into v_sub_count from archived_subs;

    -- Archive category
    update categories
    set is_active = false,
        deleted_at = now()
    where id = p_category_id;

    return json_build_object('success', true, 'archived_products', v_prod_count, 'archived_subcategories', v_sub_count);
end;
$$;
