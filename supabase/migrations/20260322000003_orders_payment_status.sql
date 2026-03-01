-- 20260322000003_orders_payment_status.sql
-- Satisfies Task 2 (Data Model) constraints

-- 1. Add additive columns (if missing)
alter table public.orders
  add column if not exists payment_status text not null default 'unpaid';

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid'));

-- 2. Backfill existing payment_status accurately
update public.orders
   set payment_status = case
         when amount_due <= 0 and total_amount > 0 then 'paid'
         when amount_paid > 0 and amount_due > 0 then 'partial'
         when total_amount = 0 and amount_paid > 0 then 'paid'
         else 'unpaid'
       end;

-- 3. Update orders amount_due trigger to also maintain payment_status automatically
create or replace function public.orders_set_amount_due_tg()
returns trigger
language plpgsql
as $$
begin
  new.total_amount := greatest(round(coalesce(new.total_amount, 0), 2), 0);
  new.amount_paid := greatest(round(coalesce(new.amount_paid, 0), 2), 0);
  new.amount_due := greatest(round(new.total_amount - new.amount_paid, 2), 0);
  
  if new.amount_due <= 0 and new.total_amount > 0 then
    new.payment_status := 'paid';
  elsif new.amount_paid > 0 and new.amount_due > 0 then
    new.payment_status := 'partial';
  elsif new.total_amount = 0 and new.amount_paid > 0 then
    new.payment_status := 'paid';
  else
    new.payment_status := 'unpaid';
  end if;
  
  return new;
end;
$$;

-- 4. Create record_order_payment as requested
create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  -- Wraps the existing safe payment addition logic
  v_res := public.add_order_payment(p_order_id, p_amount, p_method, p_note);
  return v_res;
end;
$$;

grant execute on function public.record_order_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.record_order_payment(uuid, numeric, text, text) to service_role;
