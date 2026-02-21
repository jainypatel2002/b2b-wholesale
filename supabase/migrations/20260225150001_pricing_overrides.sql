-- 1. Table for Vendor Specific Price Overrides
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

-- Prevent cross-tenant leakage: distributors can only CRUD their own products & linked vendors
alter table public.vendor_price_overrides enable row level security;

create policy "Vendor price overrides: distributor full access" on public.vendor_price_overrides
    for all using (auth.uid() = distributor_id);

-- Vendors can only SELECT pricing mapped to them
create policy "Vendor price overrides: vendor read own" on public.vendor_price_overrides
    for select using (auth.uid() = vendor_id);

-- Function to handle updated_at
drop trigger if exists set_vendor_price_overrides_updated_at on public.vendor_price_overrides;
create trigger set_vendor_price_overrides_updated_at
  before update on public.vendor_price_overrides
  for each row
  execute function update_category_nodes_updated_at(); -- Reusing trigger function from Phase 1

-- 2. Bulk Pricing Audit Logs
create table if not exists public.price_change_batches (
    id uuid default gen_random_uuid() primary key,
    distributor_id uuid references public.profiles(id) on delete cascade not null,
    created_by uuid references public.profiles(id) on delete set null,
    scope text not null, -- 'global', 'category', 'category_node'
    scope_id uuid, -- target ID if specific scope
    adjustment_type text not null, -- 'fixed_increase', 'fixed_decrease', 'percent_increase', 'overwrite'
    adjustment_value integer not null, -- the cents or percent delta
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

create policy "Price change batches: distributor read" on public.price_change_batches
    for select using (auth.uid() = distributor_id);

create policy "Price change items: distributor read" on public.price_change_items
    for select using (
        exists (select 1 from public.price_change_batches b where b.id = price_change_items.batch_id and b.distributor_id = auth.uid())
    );

-- 3. Update order items to capture price snapshot
alter table public.order_items 
add column if not exists unit_price_cents_snapshot integer;

-- 4. RPC for executing Bulk Price Changes Server-Side securely
-- This avoids thousands of round-trips for N queries
create or replace function execute_bulk_price_adjustment(
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
        select id, price from public.products
        where distributor_id = p_distributor_id
          and is_active = true and deleted_at is null
          and (
              (p_scope = 'global') or
              (p_scope = 'category' and category_id = p_scope_id) or
              (p_scope = 'category_node' and category_node_id = p_scope_id)
          )
    ),
    calculated_prices as (
        select 
            id as prod_id,
            price as old_price,
            cast(
                case 
                    when p_type = 'fixed_cents' then price + p_value
                    when p_type = 'overwrite_cents' then p_value
                    when p_type = 'percent' then round(price * (1.0 + (p_value / 100.0)))
                    else price
                end as integer
            ) as new_price
        from eligible_products
    ),
    -- Write history
    history_insert as (
        insert into public.price_change_items (batch_id, product_id, old_price_cents, new_price_cents)
        select v_batch_id, prod_id, old_price, new_price 
        from calculated_prices
        where new_price >= 0 -- safety check
    ),
    -- Execute main update
    do_update as (
        update public.products p
        set price = cp.new_price,
            updated_at = now()
        from calculated_prices cp
        where p.id = cp.prod_id and cp.new_price >= 0
        returning p.id
    )
    select count(*) into v_updated_count from do_update;

    return json_build_object('success', true, 'affected_rows', v_updated_count);
end;
$$;
