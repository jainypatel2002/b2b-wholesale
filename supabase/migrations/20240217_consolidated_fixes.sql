-- 1. Fulfill Order Logic (from 20240217_fulfill_order.sql)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'fulfilled_at') then
    alter table orders add column fulfilled_at timestamptz;
  end if;
end $$;

create or replace function fulfill_order(p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_distributor_id uuid;
  v_order_status text;
  v_item record;
begin
  select distributor_id, status into v_distributor_id, v_order_status
  from orders
  where id = p_order_id;

  if v_distributor_id is null then raise exception 'Order not found'; end if;
  if auth.uid() <> v_distributor_id then raise exception 'Not authorized'; end if;
  if v_order_status = 'fulfilled' then raise exception 'Order already fulfilled'; end if;
  if v_order_status = 'cancelled' then raise exception 'Cannot fulfill cancelled order'; end if;

  for v_item in
    select oi.product_id, oi.qty, p.stock_qty, p.name
    from order_items oi
    join products p on oi.product_id = p.id
    where oi.order_id = p_order_id
  loop
    if v_item.stock_qty < v_item.qty then
      raise exception 'Insufficient stock for product: % (Available: %, Required: %)', v_item.name, v_item.stock_qty, v_item.qty;
    end if;
  end loop;

  update products p
  set stock_qty = p.stock_qty - oi.qty
  from order_items oi
  where p.id = oi.product_id
  and oi.order_id = p_order_id;

  update orders
  set status = 'fulfilled', fulfilled_at = now()
  where id = p_order_id;
end;
$$;

-- 2. Profile Access (Fix for Invoice List & Select Vendor)
drop policy if exists "Distributors can view profiles of their invoice vendors" on profiles;
drop policy if exists "Invoice counterparts can view profiles" on profiles;
drop policy if exists "Authenticated users can view profiles" on profiles;

create policy "Authenticated users can view profiles"
on profiles
for select
to authenticated
using ( true );

-- 3. Invoice & Order Policies (Ensures visibility and creation)
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.orders enable row level security;

-- Invoices
drop policy if exists "invoices: distributor CRUD" on public.invoices;
create policy "invoices: distributor CRUD" on public.invoices
for all using (auth.uid() = distributor_id)
with check (auth.uid() = distributor_id);

drop policy if exists "invoices: vendor read" on public.invoices;
create policy "invoices: vendor read" on public.invoices
for select using (auth.uid() = vendor_id);

-- Invoice Items
drop policy if exists "invoice_items: distributor insert" on public.invoice_items;
create policy "invoice_items: distributor insert" on public.invoice_items
for insert with check (
  exists (select 1 from public.invoices i where i.id = invoice_id and i.distributor_id = auth.uid())
);

drop policy if exists "invoice_items: distributor read" on public.invoice_items;
create policy "invoice_items: distributor read" on public.invoice_items
for select using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.distributor_id = auth.uid())
);

drop policy if exists "invoice_items: vendor read" on public.invoice_items;
create policy "invoice_items: vendor read" on public.invoice_items
for select using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.vendor_id = auth.uid())
);

-- Orders (Ensure update is allowed for status transition)
drop policy if exists "orders: distributor update" on public.orders;
create policy "orders: distributor update" on public.orders
for update using (auth.uid() = distributor_id);
