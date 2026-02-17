-- 1. Ensure orders.status supports all required values
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check 
  check (status in ('placed','accepted','fulfilled','cancelled'));

-- 2. Ensure invoices have unique(order_id)
alter table public.invoices drop constraint if exists invoices_order_id_key;
alter table public.invoices add constraint invoices_order_id_key unique (order_id);

-- 3. RLS: Ensure distributor can insert invoices/items for their orders
drop policy if exists "invoices: distributor CRUD" on public.invoices;
create policy "invoices: distributor CRUD" on public.invoices
for all using (auth.uid() = distributor_id)
with check (auth.uid() = distributor_id);

drop policy if exists "invoice_items: distributor insert" on public.invoice_items;
create policy "invoice_items: distributor insert" on public.invoice_items
for insert with check (
  exists (select 1 from public.invoices i where i.id = invoice_id and i.distributor_id = auth.uid())
);

-- 4. RLS: Ensure distributor can update orders (for status changes)
drop policy if exists "orders: distributor update" on public.orders;
create policy "orders: distributor update" on public.orders
for update using (auth.uid() = distributor_id);
