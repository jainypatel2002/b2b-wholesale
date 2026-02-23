-- 1. Upgrade Products Table
-- Add packaging and inventory control fields
alter table public.products
add column if not exists allow_case boolean not null default false,
add column if not exists allow_piece boolean not null default true,
add column if not exists units_per_case integer null,
add column if not exists low_stock_threshold integer not null default 5,
add column if not exists stock_pieces integer null; -- Primary inventory counter

-- 2. Data Migration: Sync legacy stock_qty to stock_pieces
-- If stock_qty exists, we assume it represented pieces.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'stock_qty') then
    update public.products
    set stock_pieces = stock_qty
    where stock_pieces is null and stock_qty is not null;
  end if;
end $$;

-- 3. Upgrade Order Items Table
-- Add unit tracking and price snapshots
alter table public.order_items
add column if not exists order_unit text not null default 'piece',
add column if not exists cases_qty integer null,
add column if not exists pieces_qty integer null,
add column if not exists units_per_case_snapshot integer null,
add column if not exists unit_price_snapshot numeric(10,2) not null default 0,
add column if not exists total_pieces integer null; -- Helper for quick inventory calc

-- 4. Upgrade Invoice Items Table (to match Order Items)
alter table public.invoice_items
add column if not exists order_unit text not null default 'piece',
add column if not exists cases_qty integer null,
add column if not exists pieces_qty integer null,
add column if not exists units_per_case_snapshot integer null,
add column if not exists total_pieces integer null;

-- 5. Create Low Stock View
create or replace view public.low_stock_products as
select *
from public.products
where stock_pieces <= low_stock_threshold;

-- 6. Update Fulfill Order Function (Address User Feedback)
-- Remove stock deduction from fulfillment since we now deduct at placement.
create or replace function fulfill_order(p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_distributor_id uuid;
  v_order_status text;
begin
  select distributor_id, status into v_distributor_id, v_order_status
  from orders
  where id = p_order_id;

  if v_distributor_id is null then raise exception 'Order not found'; end if;
  if auth.uid() <> v_distributor_id then raise exception 'Not authorized'; end if;
  if v_order_status = 'fulfilled' then raise exception 'Order already fulfilled'; end if;
  if v_order_status = 'cancelled' then raise exception 'Cannot fulfill cancelled order'; end if;

  -- Verify stock again? No, stock was deducted at placement.
  -- Just update status.

  update orders
  set status = 'fulfilled', fulfilled_at = now()
  where id = p_order_id;
end;
$$;
