-- Vendor feature pack:
-- 1) Server-persisted vendor draft orders
-- 2) Vendor purchase insights RPC
-- 3) Invoice filter indexes for vendor-side queries

-- -------------------------------------------------------------------
-- 1) Draft Orders (additive)
-- -------------------------------------------------------------------
create table if not exists public.vendor_draft_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  name text null,
  status text not null default 'draft',
  currency text not null default 'usd',
  cart_payload jsonb not null,
  subtotal_snapshot numeric(12,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_draft_orders_vendor_distributor_idx
  on public.vendor_draft_orders (vendor_id, distributor_id);

create index if not exists vendor_draft_orders_vendor_updated_idx
  on public.vendor_draft_orders (vendor_id, updated_at desc);

create unique index if not exists vendor_draft_orders_vendor_dist_autosave_uniq
  on public.vendor_draft_orders (vendor_id, distributor_id)
  where status = 'draft' and name is null;

create or replace function public.set_vendor_draft_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vendor_draft_orders_updated_at on public.vendor_draft_orders;
create trigger set_vendor_draft_orders_updated_at
before update on public.vendor_draft_orders
for each row
execute function public.set_vendor_draft_orders_updated_at();

alter table public.vendor_draft_orders enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_draft_orders'
      and policyname = 'vendor_draft_orders: vendor read own'
  ) then
    create policy "vendor_draft_orders: vendor read own"
      on public.vendor_draft_orders
      for select
      to authenticated
      using (auth.uid() = vendor_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_draft_orders'
      and policyname = 'vendor_draft_orders: vendor insert own linked distributor'
  ) then
    create policy "vendor_draft_orders: vendor insert own linked distributor"
      on public.vendor_draft_orders
      for insert
      to authenticated
      with check (
        auth.uid() = vendor_id
        and exists (
          select 1
          from public.distributor_vendors dv
          where dv.vendor_id = auth.uid()
            and dv.distributor_id = vendor_draft_orders.distributor_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_draft_orders'
      and policyname = 'vendor_draft_orders: vendor update own linked distributor'
  ) then
    create policy "vendor_draft_orders: vendor update own linked distributor"
      on public.vendor_draft_orders
      for update
      to authenticated
      using (auth.uid() = vendor_id)
      with check (
        auth.uid() = vendor_id
        and exists (
          select 1
          from public.distributor_vendors dv
          where dv.vendor_id = auth.uid()
            and dv.distributor_id = vendor_draft_orders.distributor_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_draft_orders'
      and policyname = 'vendor_draft_orders: vendor delete own'
  ) then
    create policy "vendor_draft_orders: vendor delete own"
      on public.vendor_draft_orders
      for delete
      to authenticated
      using (auth.uid() = vendor_id);
  end if;
end
$$;

grant select, insert, update, delete on table public.vendor_draft_orders to authenticated;

-- -------------------------------------------------------------------
-- 2) Optional distributor feature settings (margin visibility switch)
-- -------------------------------------------------------------------
create table if not exists public.distributor_feature_settings (
  distributor_id uuid primary key references public.profiles(id) on delete cascade,
  vendor_can_view_margin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_distributor_feature_settings_updated_at on public.distributor_feature_settings;
create trigger set_distributor_feature_settings_updated_at
before update on public.distributor_feature_settings
for each row
execute function public.set_vendor_draft_orders_updated_at();

alter table public.distributor_feature_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'distributor_feature_settings'
      and policyname = 'distributor_feature_settings: distributor manage own'
  ) then
    create policy "distributor_feature_settings: distributor manage own"
      on public.distributor_feature_settings
      for all
      to authenticated
      using (auth.uid() = distributor_id)
      with check (auth.uid() = distributor_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'distributor_feature_settings'
      and policyname = 'distributor_feature_settings: vendor read linked'
  ) then
    create policy "distributor_feature_settings: vendor read linked"
      on public.distributor_feature_settings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.distributor_vendors dv
          where dv.distributor_id = distributor_feature_settings.distributor_id
            and dv.vendor_id = auth.uid()
        )
      );
  end if;
end
$$;

grant select, insert, update on table public.distributor_feature_settings to authenticated;

-- -------------------------------------------------------------------
-- 3) Vendor purchase insights RPC
-- -------------------------------------------------------------------
create or replace function public.get_vendor_purchase_insights(
  p_distributor_id uuid default null,
  p_window_days integer default 30
)
returns table (
  window_days integer,
  total_spent numeric(12,2),
  avg_order_value numeric(12,2),
  orders_count integer,
  order_frequency_per_week numeric(12,4),
  order_frequency_per_month numeric(12,4),
  top_categories jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days integer := greatest(coalesce(p_window_days, 30), 1);
begin
  if p_distributor_id is not null and not exists (
    select 1
    from public.distributor_vendors dv
    where dv.distributor_id = p_distributor_id
      and dv.vendor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with scoped_invoices as (
    select
      i.id,
      coalesce(i.total, 0)::numeric as total
    from public.invoices i
    where i.vendor_id = auth.uid()
      and (p_distributor_id is null or i.distributor_id = p_distributor_id)
      and i.created_at >= now() - make_interval(days => v_days)
      and i.deleted_at is null
  ),
  category_rollup as (
    select
      coalesce(
        nullif(trim(ii.category_name_snapshot), ''),
        nullif(trim(ii.category_label), ''),
        nullif(trim(ii.category_name), ''),
        'Uncategorized'
      ) as category_name,
      sum(
        coalesce(
          ii.quantity_snapshot::numeric,
          ii.qty::numeric,
          0
        )
      ) as quantity,
      sum(
        coalesce(
          ii.line_total_snapshot::numeric,
          ii.ext_amount::numeric,
          (ii.qty::numeric * ii.unit_price::numeric),
          0
        )
      ) as spend
    from public.invoice_items ii
    join scoped_invoices si on si.id = ii.invoice_id
    where coalesce(ii.is_manual, false) = false
    group by 1
  ),
  top_rows as (
    select
      category_name,
      round(coalesce(spend, 0), 2) as spend,
      round(coalesce(quantity, 0), 2) as quantity
    from category_rollup
    order by spend desc, category_name asc
    limit 5
  )
  select
    v_days as window_days,
    round(coalesce(sum(si.total), 0), 2)::numeric(12,2) as total_spent,
    round(coalesce(avg(si.total), 0), 2)::numeric(12,2) as avg_order_value,
    count(*)::integer as orders_count,
    round((count(*)::numeric / greatest(v_days::numeric / 7.0, 1.0)), 4)::numeric(12,4) as order_frequency_per_week,
    round((count(*)::numeric / greatest(v_days::numeric / 30.0, 1.0)), 4)::numeric(12,4) as order_frequency_per_month,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'category_name', tr.category_name,
          'spend', tr.spend,
          'quantity', tr.quantity
        )
        order by tr.spend desc, tr.category_name asc
      )
      from top_rows tr
    ), '[]'::jsonb) as top_categories
  from scoped_invoices si;
end;
$$;

grant execute on function public.get_vendor_purchase_insights(uuid, integer) to authenticated;
grant execute on function public.get_vendor_purchase_insights(uuid, integer) to service_role;

-- -------------------------------------------------------------------
-- 4) Vendor invoice filter performance indexes
-- -------------------------------------------------------------------
create index if not exists idx_invoices_vendor_created_at
  on public.invoices (vendor_id, created_at desc);

create index if not exists idx_invoices_vendor_payment_status
  on public.invoices (vendor_id, payment_status);

create index if not exists idx_invoices_vendor_distributor
  on public.invoices (vendor_id, distributor_id);

create index if not exists idx_invoices_vendor_dist_created
  on public.invoices (vendor_id, distributor_id, created_at desc);
