-- 1. Create table for infinite nested categories
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

-- Indexes for category_nodes
create index if not exists category_nodes_distributor_id_idx on public.category_nodes(distributor_id);
create index if not exists category_nodes_category_id_idx on public.category_nodes(category_id);
create index if not exists category_nodes_parent_id_idx on public.category_nodes(parent_id);

-- RLS for category_nodes
alter table public.category_nodes enable row level security;

create policy "category_nodes: distributor can do all" on public.category_nodes
    for all using (auth.uid() = distributor_id);

create policy "category_nodes: vendors can read linked distributor nodes" on public.category_nodes
    for select using (
        exists (
            select 1 from public.vendor_distributor_links vdl
            where vdl.distributor_id = category_nodes.distributor_id
            and vdl.vendor_id = auth.uid()
            and vdl.status = 'active'
        )
    );

-- 2. Add foreign key to products
alter table public.products 
add column if not exists category_node_id uuid references public.category_nodes(id) on delete set null;

create index if not exists products_category_node_id_idx on public.products(category_node_id);

-- 3. Backfill existing subcategories -> category_nodes
insert into public.category_nodes (id, distributor_id, category_id, name, created_at, is_active, deleted_at)
select 
    id, distributor_id, category_id, name, created_at, is_active, deleted_at 
from public.subcategories
on conflict (id) do nothing; -- Assuming uuid matches exactly, safely backfill

-- Point existing products to the backfilled nodes
update public.products
set category_node_id = subcategory_id
where subcategory_id is not null and category_node_id is null;

-- 4. Trigger for updated_at
create or replace function update_category_nodes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_category_nodes_updated_at on public.category_nodes;
create trigger set_category_nodes_updated_at
  before update on public.category_nodes
  for each row
  execute function update_category_nodes_updated_at();

-- 5. Safe Delete RPC
create or replace function archive_category_node(p_node_id uuid)
returns json
language plpgsql
security definer
as $$
declare
    v_prod_count int;
begin
    -- 1. Check permissions
    if not exists (
        select 1 from public.category_nodes
        where id = p_node_id and distributor_id = auth.uid()
    ) then
        return json_build_object('error', 'Unauthorized or not found');
    end if;

    -- 2. Check if products exist on THIS exact node (Blocking option requested by user)
    select count(*) into v_prod_count 
    from public.products 
    where category_node_id = p_node_id and is_active = true and deleted_at is null;

    if v_prod_count > 0 then
        return json_build_object('error', format('Cannot delete: %s active products are linked to this category level. Please move them first.', v_prod_count));
    end if;

    -- 3. Soft Delete node and ALL CHILDREN
    -- CTE to find all descendants recursively
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
