-- 20260322000002_vendor_amount_due_payments.sql
-- Migrates receivables from free-floating credit balances to order-linked payments.
-- Additive/compatible: legacy credit tables remain untouched for historical reads.

-- ------------------------------------------------------------------
-- Order payments ledger (per-order partial payments)
-- ------------------------------------------------------------------
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null,
  vendor_id uuid not null,
  order_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  method text null,
  note text null,
  paid_at timestamptz not null default now(),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists order_payments_distributor_vendor_paid_idx
  on public.order_payments (distributor_id, vendor_id, paid_at desc);
create index if not exists order_payments_order_paid_idx
  on public.order_payments (order_id, paid_at desc);

do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_payments_distributor_id_fkey'
        and conrelid = 'public.order_payments'::regclass
    ) then
      alter table public.order_payments
        add constraint order_payments_distributor_id_fkey
        foreign key (distributor_id) references public.profiles(id) on delete cascade not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_payments_vendor_id_fkey'
        and conrelid = 'public.order_payments'::regclass
    ) then
      alter table public.order_payments
        add constraint order_payments_vendor_id_fkey
        foreign key (vendor_id) references public.profiles(id) on delete cascade not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_payments_created_by_fkey'
        and conrelid = 'public.order_payments'::regclass
    ) then
      alter table public.order_payments
        add constraint order_payments_created_by_fkey
        foreign key (created_by) references public.profiles(id) on delete restrict not valid;
    end if;
  end if;

  if to_regclass('public.orders') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_payments_order_id_fkey'
        and conrelid = 'public.order_payments'::regclass
    ) then
      alter table public.order_payments
        add constraint order_payments_order_id_fkey
        foreign key (order_id) references public.orders(id) on delete cascade not valid;
    end if;
  end if;
end $$;

alter table public.order_payments enable row level security;

drop policy if exists "order_payments: distributor manage own" on public.order_payments;
create policy "order_payments: distributor manage own"
  on public.order_payments
  for all
  to authenticated
  using (auth.uid() = distributor_id)
  with check (
    auth.uid() = distributor_id
    and exists (
      select 1
      from public.orders o
      where o.id = order_payments.order_id
        and o.distributor_id = order_payments.distributor_id
        and o.vendor_id = order_payments.vendor_id
    )
  );

drop policy if exists "order_payments: vendor read own" on public.order_payments;
create policy "order_payments: vendor read own"
  on public.order_payments
  for select
  to authenticated
  using (
    auth.uid() = vendor_id
    and exists (
      select 1
      from public.orders o
      where o.id = order_payments.order_id
        and o.distributor_id = order_payments.distributor_id
        and o.vendor_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.order_payments to authenticated;

-- ------------------------------------------------------------------
-- Order receivables snapshot columns
-- ------------------------------------------------------------------
alter table public.orders
  add column if not exists total_amount numeric(12,2) not null default 0,
  add column if not exists amount_paid numeric(12,2) not null default 0,
  add column if not exists amount_due numeric(12,2) not null default 0;

create index if not exists orders_distributor_vendor_due_idx
  on public.orders (distributor_id, vendor_id, amount_due);

-- ------------------------------------------------------------------
-- Helpers: total math + amount_due sync
-- ------------------------------------------------------------------
create or replace function public.compute_order_total_amount(p_order_id uuid)
returns numeric(12,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_subtotal numeric(12,2) := 0;
  v_adjustment_total numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_sql text;
  v_has_removed boolean := false;
  v_has_edited_unit_price boolean := false;
  v_has_edited_qty boolean := false;
  v_has_amount boolean := false;
  v_has_type boolean := false;
  v_has_rate_percent boolean := false;
  v_tax record;
begin
  if p_order_id is null then
    return 0;
  end if;

  if to_regclass('public.order_items') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_items' and column_name = 'removed'
    ) into v_has_removed;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_items' and column_name = 'edited_unit_price'
    ) into v_has_edited_unit_price;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_items' and column_name = 'edited_qty'
    ) into v_has_edited_qty;

    v_sql := format(
      'select coalesce(sum((%s) * (%s)), 0) from public.order_items oi where oi.order_id = $1 and (%s)',
      case when v_has_edited_unit_price then 'coalesce(oi.edited_unit_price, oi.unit_price)' else 'oi.unit_price' end,
      case when v_has_edited_qty then 'coalesce(oi.edited_qty, oi.qty)' else 'oi.qty' end,
      case when v_has_removed then 'coalesce(oi.removed, false) = false' else 'true' end
    );

    execute v_sql into v_item_subtotal using p_order_id;
  end if;

  if to_regclass('public.order_adjustments') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_adjustments' and column_name = 'amount'
    ) into v_has_amount;

    if v_has_amount then
      execute 'select coalesce(sum(amount), 0) from public.order_adjustments where order_id = $1'
        into v_adjustment_total
        using p_order_id;
    end if;
  end if;

  v_subtotal := round(coalesce(v_item_subtotal, 0) + coalesce(v_adjustment_total, 0), 2);

  if to_regclass('public.order_taxes') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_taxes' and column_name = 'type'
    ) into v_has_type;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_taxes' and column_name = 'rate_percent'
    ) into v_has_rate_percent;

    v_sql := format(
      'select %s as tax_type, %s as tax_rate from public.order_taxes where order_id = $1',
      case when v_has_type then 'coalesce(type, ''percent'')' else '''percent''' end,
      case when v_has_rate_percent then 'coalesce(rate_percent, 0)' else '0' end
    );

    for v_tax in execute v_sql using p_order_id
    loop
      if v_tax.tax_type = 'percent' then
        v_tax_total := v_tax_total + (v_subtotal * (coalesce(v_tax.tax_rate, 0) / 100.0));
      else
        v_tax_total := v_tax_total + coalesce(v_tax.tax_rate, 0);
      end if;
    end loop;
  end if;

  v_tax_total := round(coalesce(v_tax_total, 0), 2);

  return greatest(round(v_subtotal + v_tax_total, 2), 0)::numeric(12,2);
end;
$$;

create or replace function public.recalculate_order_payment_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
begin
  if p_order_id is null then
    return;
  end if;

  if not exists (select 1 from public.orders o where o.id = p_order_id) then
    return;
  end if;

  v_total := coalesce(public.compute_order_total_amount(p_order_id), 0);

  if to_regclass('public.order_payments') is not null then
    select coalesce(round(sum(op.amount), 2), 0)
      into v_paid
    from public.order_payments op
    where op.order_id = p_order_id;
  end if;

  v_paid := greatest(round(coalesce(v_paid, 0), 2), 0)::numeric(12,2);

  update public.orders o
     set total_amount = greatest(round(v_total, 2), 0)::numeric(12,2),
         amount_paid = v_paid,
         amount_due = greatest(round(v_total - v_paid, 2), 0)::numeric(12,2)
   where o.id = p_order_id;
end;
$$;

create or replace function public.orders_set_amount_due_tg()
returns trigger
language plpgsql
as $$
begin
  new.total_amount := greatest(round(coalesce(new.total_amount, 0), 2), 0);
  new.amount_paid := greatest(round(coalesce(new.amount_paid, 0), 2), 0);
  new.amount_due := greatest(round(new.total_amount - new.amount_paid, 2), 0);
  return new;
end;
$$;

drop trigger if exists orders_set_amount_due on public.orders;
create trigger orders_set_amount_due
before insert or update of total_amount, amount_paid on public.orders
for each row
execute function public.orders_set_amount_due_tg();

create or replace function public.order_payments_recalculate_order_totals_tg()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_order_payment_totals(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    perform public.recalculate_order_payment_totals(old.order_id);
  end if;

  perform public.recalculate_order_payment_totals(new.order_id);
  return new;
end;
$$;

drop trigger if exists order_payments_recalculate_order_totals on public.order_payments;
create trigger order_payments_recalculate_order_totals
after insert or update or delete on public.order_payments
for each row
execute function public.order_payments_recalculate_order_totals_tg();

create or replace function public.order_components_recalculate_order_totals_tg()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    perform public.recalculate_order_payment_totals(old.order_id);
  end if;

  perform public.recalculate_order_payment_totals(v_order_id);
  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.order_items') is not null then
    execute 'drop trigger if exists order_items_recalculate_order_totals on public.order_items';
    execute 'create trigger order_items_recalculate_order_totals after insert or update or delete on public.order_items for each row execute function public.order_components_recalculate_order_totals_tg()';
  end if;

  if to_regclass('public.order_adjustments') is not null then
    execute 'drop trigger if exists order_adjustments_recalculate_order_totals on public.order_adjustments';
    execute 'create trigger order_adjustments_recalculate_order_totals after insert or update or delete on public.order_adjustments for each row execute function public.order_components_recalculate_order_totals_tg()';
  end if;

  if to_regclass('public.order_taxes') is not null then
    execute 'drop trigger if exists order_taxes_recalculate_order_totals on public.order_taxes';
    execute 'create trigger order_taxes_recalculate_order_totals after insert or update or delete on public.order_taxes for each row execute function public.order_components_recalculate_order_totals_tg()';
  end if;
end $$;

-- ------------------------------------------------------------------
-- Backfill order totals/payment snapshots
-- ------------------------------------------------------------------
update public.orders o
   set total_amount = s.total_amount,
       amount_paid = s.amount_paid,
       amount_due = greatest(round(s.total_amount - s.amount_paid, 2), 0)::numeric(12,2)
  from (
    select
      ord.id,
      coalesce(public.compute_order_total_amount(ord.id), 0)::numeric(12,2) as total_amount,
      coalesce(round(sum(op.amount), 2), 0)::numeric(12,2) as amount_paid
    from public.orders ord
    left join public.order_payments op
      on op.order_id = ord.id
    group by ord.id
  ) as s
 where o.id = s.id;

-- ------------------------------------------------------------------
-- RPC: record payment with tenant-safe validation and no overpayment
-- ------------------------------------------------------------------
create or replace function public.add_order_payment(
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
  v_order public.orders%rowtype;
  v_payment_id uuid;
  v_existing_paid numeric(12,2) := 0;
  v_new_paid numeric(12,2) := 0;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  perform public.recalculate_order_payment_totals(p_order_id);

  select o.*
    into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if auth.role() <> 'service_role' and auth.uid() is distinct from v_order.distributor_id then
    raise exception 'Not authorized to record payment for this order';
  end if;

  select coalesce(round(sum(op.amount), 2), 0)::numeric(12,2)
    into v_existing_paid
  from public.order_payments op
  where op.order_id = p_order_id;

  v_new_paid := round(v_existing_paid + round(p_amount, 2), 2);

  if v_new_paid > round(coalesce(v_order.total_amount, 0), 2) then
    raise exception 'Payment exceeds order total';
  end if;

  insert into public.order_payments (
    distributor_id,
    vendor_id,
    order_id,
    amount,
    method,
    note,
    paid_at,
    created_by
  )
  values (
    v_order.distributor_id,
    v_order.vendor_id,
    p_order_id,
    round(p_amount, 2),
    nullif(trim(coalesce(p_method, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    now(),
    coalesce(auth.uid(), v_order.distributor_id)
  )
  returning id into v_payment_id;

  perform public.recalculate_order_payment_totals(p_order_id);

  select o.*
    into v_order
  from public.orders o
  where o.id = p_order_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'order_id', v_order.id,
    'total_amount', coalesce(v_order.total_amount, 0),
    'amount_paid', coalesce(v_order.amount_paid, 0),
    'amount_due', coalesce(v_order.amount_due, 0)
  );
end;
$$;

grant execute on function public.add_order_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.add_order_payment(uuid, numeric, text, text) to service_role;

-- ------------------------------------------------------------------
-- RPC: vendor receivables summary
-- ------------------------------------------------------------------
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
      )
    then
      raise exception 'Not authorized';
    end if;
  end if;

  return query
  select
    coalesce(round(sum(o.amount_due) filter (where coalesce(o.amount_due, 0) > 0), 2), 0)::numeric(12,2) as vendor_total_due,
    coalesce(count(*) filter (where coalesce(o.amount_due, 0) > 0), 0)::bigint as count_unpaid_orders,
    (
      select max(op.paid_at)
      from public.order_payments op
      where op.distributor_id = p_distributor_id
        and op.vendor_id = p_vendor_id
    ) as last_payment_date
  from public.orders o
  where o.distributor_id = p_distributor_id
    and o.vendor_id = p_vendor_id;
end;
$$;

grant execute on function public.get_vendor_amount_due(uuid, uuid) to authenticated;
grant execute on function public.get_vendor_amount_due(uuid, uuid) to service_role;
