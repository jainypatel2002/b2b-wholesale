-- 20260225150007_lock_stock_quantity.sql

-- 1. Add Stock Lock Columns to Products
alter table public.products
add column if not exists stock_locked boolean not null default false,
add column if not exists locked_stock_qty integer;

-- Ensure consistency with a check constraint
alter table public.products drop constraint if exists products_locked_stock_check;
alter table public.products add constraint products_locked_stock_check
  check (
    (stock_locked = false) OR 
    (stock_locked = true AND locked_stock_qty IS NOT NULL AND locked_stock_qty >= 0)
  );

-- 2. Update Fulfill Order RPC to bypass locked products
drop function if exists public.fulfill_order(uuid);

create or replace function public.fulfill_order(p_order_id uuid)
returns json
language plpgsql
security definer -- Required to allow distributor to update product stock if RLS is strict
set search_path = public
as $$
declare
  v_distributor_id uuid;
  v_order_status text;
  v_item record;
  v_product_name text;
  v_missing_items text[] := array[]::text[];
begin
  -- 1. Fetch Order Details & Verify Authority
  select distributor_id, status 
  into v_distributor_id, v_order_status
  from orders
  where id = p_order_id;

  if v_distributor_id is null then
    raise exception 'Order not found';
  end if;

  -- Verify User is the Distributor
  if auth.uid() <> v_distributor_id then
    raise exception 'Not authorized: You are not the distributor for this order';
  end if;

  -- 2. Verify Order State
  if v_order_status = 'fulfilled' then
    raise exception 'Order already fulfilled';
  end if;
  
  if v_order_status = 'cancelled' then
    raise exception 'Cannot fulfill cancelled order';
  end if;

  -- 3. Check Stock for ALL items
  -- We lock the product rows to prevent race conditions (FOR UPDATE)
  for v_item in 
    select 
      oi.product_id, 
      oi.total_pieces, -- Canonical quantity
      p.stock_pieces,
      p.name as product_name,
      p.stock_locked
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id
    for update of p -- LOCK these rows
  loop
    -- Check if we have enough stock, bypass check completely if locked
    if v_item.stock_locked = false and v_item.stock_pieces < v_item.total_pieces then
      v_missing_items := array_append(v_missing_items, v_item.product_name || ' (Need: ' || v_item.total_pieces || ', Have: ' || v_item.stock_pieces || ')');
    end if;
  end loop;

  -- If any items are missing, raise an exception with the list
  if array_length(v_missing_items, 1) > 0 then
    raise exception 'Insufficient stock for: %', array_to_string(v_missing_items, ', ');
  end if;

  -- 4. Deduct Stock
  for v_item in 
    select oi.product_id, oi.total_pieces, oi.qty, p.stock_locked
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id
  loop
    -- Only deduct if the stock is NOT locked
    if v_item.stock_locked = false then
      update products
      set 
        stock_pieces = stock_pieces - v_item.total_pieces,
        stock_qty = stock_qty - v_item.qty
      where id = v_item.product_id;
    end if;
  end loop;

  -- 5. Update Order Status
  update orders
  set 
    status = 'fulfilled',
    fulfilled_at = now()
  where id = p_order_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.fulfill_order(uuid) to authenticated;
