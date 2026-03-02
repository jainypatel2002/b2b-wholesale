-- 20260322000004_order_payment_summary_guardrails.sql
-- Canonical order payment summary + strict payment guard rails.

-- ------------------------------------------------------------
-- Canonical per-order payment summary (single source of truth)
-- ------------------------------------------------------------
create or replace view public.order_payment_summary
with (security_invoker = true)
as
select
  o.id as order_id,
  o.vendor_id,
  o.distributor_id,
  o.status as order_status,
  o.created_at as order_created_at,
  greatest(round(coalesce(o.total_amount, 0), 2), 0)::numeric(12,2) as order_total,
  coalesce(round(sum(op.amount), 2), 0)::numeric(12,2) as paid_total,
  greatest(
    round(
      coalesce(o.total_amount, 0) - coalesce(sum(op.amount), 0),
      2
    ),
    0
  )::numeric(12,2) as due_total,
  max(coalesce(op.paid_at, op.created_at)) as last_payment_at,
  count(op.id)::bigint as payment_count
from public.orders o
left join public.order_payments op
  on op.order_id = o.id
 and op.distributor_id = o.distributor_id
 and op.vendor_id = o.vendor_id
group by
  o.id,
  o.vendor_id,
  o.distributor_id,
  o.status,
  o.created_at,
  o.total_amount;

grant select on public.order_payment_summary to authenticated;
grant select on public.order_payment_summary to service_role;

-- ------------------------------------------------------------
-- Trigger guard rails: normalize + validate every payment write
-- ------------------------------------------------------------
create or replace function public.order_payments_validate_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing_paid numeric(12,2) := 0;
  v_current_due numeric(12,2) := 0;
  v_actor uuid;
  v_tolerance constant numeric(12,2) := 0.01;
begin
  if new.order_id is null then
    raise exception 'Order is required';
  end if;

  if new.amount is null then
    raise exception 'Payment amount is required';
  end if;

  new.amount := round(new.amount, 2);

  if new.amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if new.amount > 1000000 then
    raise exception 'Payment amount exceeds allowed maximum';
  end if;

  select o.*
    into v_order
  from public.orders o
  where o.id = new.order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'Cannot move payment to a different order';
  end if;

  if new.distributor_id is null then
    new.distributor_id := v_order.distributor_id;
  end if;

  if new.vendor_id is null then
    new.vendor_id := v_order.vendor_id;
  end if;

  if new.distributor_id is distinct from v_order.distributor_id
     or new.vendor_id is distinct from v_order.vendor_id then
    raise exception 'Payment tenant does not match order';
  end if;

  v_actor := auth.uid();

  if auth.role() <> 'service_role' and v_actor is distinct from v_order.distributor_id then
    raise exception 'Only the distributor can record payments for this order';
  end if;

  if new.created_by is null then
    new.created_by := coalesce(v_actor, v_order.distributor_id);
  end if;

  new.method := lower(trim(coalesce(new.method, '')));
  if new.method = '' then
    new.method := 'unspecified';
  end if;

  new.note := nullif(trim(coalesce(new.note, '')), '');

  if new.paid_at is null then
    new.paid_at := now();
  end if;

  select coalesce(round(sum(op.amount), 2), 0)::numeric(12,2)
    into v_existing_paid
  from public.order_payments op
  where op.order_id = new.order_id
    and (tg_op <> 'UPDATE' or op.id <> new.id);

  v_current_due := greatest(
    round(coalesce(v_order.total_amount, 0) - v_existing_paid, 2),
    0
  )::numeric(12,2);

  if new.amount > v_current_due + v_tolerance then
    raise exception 'Payment exceeds remaining amount due (due: %, attempted: %)', v_current_due, new.amount;
  end if;

  return new;
end;
$$;

drop trigger if exists order_payments_validate on public.order_payments;
create trigger order_payments_validate
before insert or update on public.order_payments
for each row
execute function public.order_payments_validate_tg();

-- ------------------------------------------------------------
-- Keep existing RPC signature, but compute via canonical summary
-- ------------------------------------------------------------
create or replace function public.get_vendor_amount_due(
  p_distributor_id uuid,
  p_vendor_id uuid
)
returns table (
  vendor_total_due numeric(12,2),
  count_unpaid_orders bigint,
  last_payment_date timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_distributor_id is null or p_vendor_id is null then
    raise exception 'Distributor and vendor are required';
  end if;

  if auth.role() <> 'service_role' then
    if auth.uid() is distinct from p_distributor_id and auth.uid() is distinct from p_vendor_id then
      raise exception 'Not authorized';
    end if;

    if auth.uid() = p_vendor_id
      and to_regclass('public.distributor_vendors') is not null
      and not exists (
        select 1
        from public.distributor_vendors dv
        where dv.distributor_id = p_distributor_id
          and dv.vendor_id = p_vendor_id
      ) then
      raise exception 'Not authorized';
    end if;
  end if;

  return query
  select
    coalesce(round(sum(s.due_total) filter (where s.due_total > 0), 2), 0)::numeric(12,2) as vendor_total_due,
    coalesce(count(*) filter (where s.due_total > 0), 0)::bigint as count_unpaid_orders,
    max(s.last_payment_at) as last_payment_date
  from public.order_payment_summary s
  where s.distributor_id = p_distributor_id
    and s.vendor_id = p_vendor_id;
end;
$$;

grant execute on function public.get_vendor_amount_due(uuid, uuid) to authenticated;
grant execute on function public.get_vendor_amount_due(uuid, uuid) to service_role;
