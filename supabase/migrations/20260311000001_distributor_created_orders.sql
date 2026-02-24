-- Add metadata for who created the order (vendor vs distributor)
alter table public.orders
  add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_source text;

alter table public.orders
  drop constraint if exists orders_created_by_role_check;

alter table public.orders
  add constraint orders_created_by_role_check
  check (created_by_role is null or created_by_role in ('vendor', 'distributor'));

create index if not exists idx_orders_distributor_created_by_role
  on public.orders(distributor_id, created_by_role);

-- Allow distributors to insert orders for linked vendors
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders: distributor insert linked vendor'
  ) then
    create policy "orders: distributor insert linked vendor"
      on public.orders
      for insert
      to authenticated
      with check (
        auth.uid() = distributor_id
        and exists (
          select 1
          from public.distributor_vendors dv
          where dv.distributor_id = orders.distributor_id
            and dv.vendor_id = orders.vendor_id
        )
      );
  end if;
end $$;

-- Allow distributors to insert order items for their own orders
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items: distributor insert own orders'
  ) then
    create policy "order_items: distributor insert own orders"
      on public.order_items
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.orders o
          where o.id = order_items.order_id
            and o.distributor_id = auth.uid()
        )
      );
  end if;
end $$;
