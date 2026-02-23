-- "NUCLEAR" FIX: Reset all RLS policies for Orders, Invoices, and Profiles.
-- Run this if you are experiencing "Permission Denied" or "Missing Invoices" issues.

-- 1. PROFILES (Allow visibility)
drop policy if exists "Distributors can view profiles of their invoice vendors" on profiles;
drop policy if exists "Invoice counterparts can view profiles" on profiles;
drop policy if exists "Authenticated users can view profiles" on profiles;

create policy "Authenticated users can view profiles"
on profiles for select to authenticated using ( true );

-- 2. ORDERS (Allow updates)
alter table orders enable row level security;
drop policy if exists "orders: distributor update" on orders;
-- Allow distributor to update their own orders (needed for status changes)
create policy "orders: distributor update" on orders
for update using (auth.uid() = distributor_id);

-- Allow distributor to select their own orders
drop policy if exists "orders: distributor select" on orders;
create policy "orders: distributor select" on orders
for select using (auth.uid() = distributor_id);

-- 3. INVOICES (Full Access for Distributor)
alter table invoices enable row level security;
drop policy if exists "invoices: distributor CRUD" on invoices;
drop policy if exists "invoices: vendor read" on invoices;

-- Distributor has full power over their invoices
create policy "invoices: distributor full" on invoices
for all using (auth.uid() = distributor_id);

-- Vendor can view their invoices
create policy "invoices: vendor view" on invoices
for select using (auth.uid() = vendor_id);

-- 4. INVOICE ITEMS
alter table invoice_items enable row level security;
-- Drop old potential policies
drop policy if exists "invoice_items: distributor insert" on invoice_items;
drop policy if exists "invoice_items: distributor read" on invoice_items;
drop policy if exists "invoice_items: vendor read" on invoice_items;

-- Distributor can doing anything to items of their invoices
create policy "invoice_items: distributor full" on invoice_items
for all using (
  exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.distributor_id = auth.uid())
)
with check (
  exists (select 1 from invoices i where i.id = invoice_id and i.distributor_id = auth.uid())
);

-- Vendor can view items of their invoices
create policy "invoice_items: vendor view" on invoice_items
for select using (
  exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.vendor_id = auth.uid())
);

-- 5. PRODUCTS (Stock Updates)
alter table products enable row level security;
-- Ensure distributor can update their products (for stock deduction outside RPC if needed, though RPC handles it)
drop policy if exists "products: distributor update" on products;
create policy "products: distributor update" on products
for update using (auth.uid() = distributor_id);

-- 6. RE-APPLY FULFILL_ORDER FUNCTION (Just in case)
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
