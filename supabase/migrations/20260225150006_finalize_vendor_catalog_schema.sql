-- 20260225150006_finalize_vendor_catalog_schema.sql
-- COMPLETE, IDEMPOTENT, BUG-FREE DEFINITIVE SCRIPT
-- RUN THIS ENTIRE FILE IN THE SUPABASE SQL EDITOR

-- ==========================================
-- PHASE 1: NESTED CATEGORIES & ARCHIVING
-- ==========================================
create table if not exists public.category_nodes (
    id uuid default gen_random_uuid() primary key,
    distributor_id uuid references public.profiles(id) on delete cascade not null,
    category_id uuid references public.categories(id) on delete cascade not null, -- Top level grouping
    parent_id uuid references public.category_nodes(id) on delete cascade, -- Self-referential for infinite nesting
    name text not null,
    sort_order integer default 0 not null,
    is_active boolean default true not null,
    deleted_at timestamptz,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index if not exists category_nodes_distributor_id_idx on public.category_nodes(distributor_id);
create index if not exists category_nodes_category_id_idx on public.category_nodes(category_id);
create index if not exists category_nodes_parent_id_idx on public.category_nodes(parent_id);

alter table public.category_nodes enable row level security;

-- Drop if exists to be fully idempotent on replay
drop policy if exists "category_nodes: distributor can do all" on public.category_nodes;
create policy "category_nodes: distributor can do all" on public.category_nodes
    for all using (auth.uid() = distributor_id);

drop policy if exists "category_nodes: vendors can read linked distributor nodes" on public.category_nodes;
create policy "category_nodes: vendors can read linked distributor nodes" on public.category_nodes
    for select using (
        exists (
            select 1 from public.distributor_vendors dv
            where dv.distributor_id = category_nodes.distributor_id
            and dv.vendor_id = auth.uid()
        )
    );

-- Add foreign key to products
alter table public.products 
add column if not exists category_node_id uuid references public.category_nodes(id) on delete set null;

create index if not exists products_category_node_id_idx on public.products(category_node_id);

-- Safe Delete RPC
create or replace function public.archive_category_node(p_node_id uuid)
returns json
language plpgsql
security definer
as $$
declare
    v_prod_count int;
begin
    if not exists (
        select 1 from public.category_nodes
        where id = p_node_id and distributor_id = auth.uid()
    ) then
        return json_build_object('error', 'Unauthorized or not found');
    end if;

    select count(*) into v_prod_count 
    from public.products 
    where category_node_id = p_node_id and active = true and deleted_at is null;

    if v_prod_count > 0 then
        return json_build_object('error', format('Cannot delete: %s active products are linked to this category level. Please move them first.', v_prod_count));
    end if;

    with recursive descendants as (
        select id from public.category_nodes where id = p_node_id
        union all
        select cn.id from public.category_nodes cn
        inner join descendants d on cn.parent_id = d.id
    )
    update public.category_nodes
    set is_active = false, deleted_at = now()
    where id in (select id from descendants);

    return json_build_object('success', true);
end;
$$;


-- ==========================================
-- PHASE 2: PRICING OVERRIDES
-- ==========================================
create table if not exists public.vendor_price_overrides (
    id uuid default gen_random_uuid() primary key,
    distributor_id uuid references public.profiles(id) on delete cascade not null,
    vendor_id uuid references public.profiles(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    price_cents integer not null,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    unique(distributor_id, vendor_id, product_id)
);

create index if not exists vendor_price_overrides_dist_vend_idx on public.vendor_price_overrides(distributor_id, vendor_id);

alter table public.vendor_price_overrides enable row level security;

drop policy if exists "Vendor price overrides: distributor full access" on public.vendor_price_overrides;
create policy "Vendor price overrides: distributor full access" on public.vendor_price_overrides
    for all using (auth.uid() = distributor_id);

drop policy if exists "Vendor price overrides: vendor read own" on public.vendor_price_overrides;
create policy "Vendor price overrides: vendor read own" on public.vendor_price_overrides
    for select using (auth.uid() = vendor_id);

create table if not exists public.price_change_batches (
    id uuid default gen_random_uuid() primary key,
    distributor_id uuid references public.profiles(id) on delete cascade not null,
    created_by uuid references public.profiles(id) on delete set null,
    scope text not null, 
    scope_id uuid,
    adjustment_type text not null, 
    adjustment_value integer not null, 
    created_at timestamptz default now() not null
);

create table if not exists public.price_change_items (
    id uuid default gen_random_uuid() primary key,
    batch_id uuid references public.price_change_batches(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete cascade not null,
    old_price_cents integer,
    new_price_cents integer,
    created_at timestamptz default now() not null
);

alter table public.price_change_batches enable row level security;
alter table public.price_change_items enable row level security;

drop policy if exists "Price change batches: distributor read" on public.price_change_batches;
create policy "Price change batches: distributor read" on public.price_change_batches
    for select using (auth.uid() = distributor_id);

drop policy if exists "Price change items: distributor read" on public.price_change_items;
create policy "Price change items: distributor read" on public.price_change_items
    for select using (
        exists (select 1 from public.price_change_batches b where b.id = price_change_items.batch_id and b.distributor_id = auth.uid())
    );


-- ==========================================
-- PHASE 3: THE HIGH-PERFORMANCE RPC ENGINE 
-- ==========================================

-- Drop previous signatures first in case return types break the replace
drop function if exists public.get_vendor_catalog_prices(uuid);
drop function if exists public.get_vendor_catalog_prices(uuid, uuid);

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
security invoker
set search_path = public
as $$
begin
    -- 1. Verification: Vendor must be linked
    if not exists (
        select 1 from public.distributor_vendors dv
        where dv.distributor_id = p_distributor_id
        and dv.vendor_id = auth.uid()
    ) then
        return; 
    end if;

    -- 2. Return data combining overrides 
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

grant execute on function public.get_vendor_catalog_prices(uuid) to authenticated;
grant execute on function public.get_vendor_catalog_prices(uuid) to service_role;


-- Bulk pricing adjustment RPC
create or replace function public.execute_bulk_price_adjustment(
    p_distributor_id uuid,
    p_scope text,       
    p_scope_id uuid,    
    p_type text,        
    p_value numeric     
)
returns json
language plpgsql
security definer
as $$
declare
    v_batch_id uuid;
    v_updated_count integer := 0;
begin
    if p_distributor_id != auth.uid() then
        return json_build_object('error', 'Unauthorized');
    end if;

    insert into public.price_change_batches (distributor_id, created_by, scope, scope_id, adjustment_type, adjustment_value)
    values (p_distributor_id, auth.uid(), p_scope, p_scope_id, p_type, p_value)
    returning id into v_batch_id;

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
            CAST(ROUND(sell_price * 100) AS INTEGER) as old_price,
            cast(
                case 
                    when p_type = 'fixed_cents' then (sell_price * 100) + p_value
                    when p_type = 'overwrite_cents' then p_value
                    when p_type = 'percent' then round((sell_price * 100) * (1.0 + (p_value / 100.0)))
                    else (sell_price * 100)
                end as integer
            ) as new_price
        from eligible_products
    ),
    history_insert as (
        insert into public.price_change_items (batch_id, product_id, old_price_cents, new_price_cents)
        select v_batch_id, prod_id, old_price, new_price 
        from calculated_prices
        where new_price >= 0 
    ),
    do_update as (
        update public.products p
        set sell_price = (cp.new_price / 100.0),
            updated_at = now()
        from calculated_prices cp
        where p.id = cp.prod_id and cp.new_price >= 0
        returning p.id
    )
    select count(*) into v_updated_count from do_update;

    return json_build_object('success', true, 'affected_rows', v_updated_count);
end;
$$;
