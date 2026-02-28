-- 20260322000001_vendor_credit_system.sql
-- Manual vendor credit ledger + order credit application system.
-- Additive only: keeps existing order/invoice totals intact and exposes amount_due as derived.

-- ------------------------------------------------------------------
-- Part A safeguard: enforce units_per_case >= 1 (case-only can use 1)
-- ------------------------------------------------------------------
do $$
declare
  v_products regclass := to_regclass('public.products');
begin
  if v_products is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'products_units_per_case_min_1'
      and conrelid = v_products
  ) then
    alter table public.products
      add constraint products_units_per_case_min_1
      check (units_per_case is null or units_per_case >= 1) not valid;
  end if;
end $$;

-- ------------------------------------------------------------------
-- Vendor credit ledger (auditable source of truth)
-- ------------------------------------------------------------------
create table if not exists public.vendor_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null,
  vendor_id uuid not null,
  type text not null check (type in ('credit_add', 'credit_deduct', 'credit_apply', 'credit_reversal')),
  amount numeric(12,2) not null check (amount > 0),
  order_id uuid null,
  invoice_id uuid null,
  note text null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists vendor_credit_ledger_dist_vendor_created_idx
  on public.vendor_credit_ledger (distributor_id, vendor_id, created_at desc);
create index if not exists vendor_credit_ledger_order_idx
  on public.vendor_credit_ledger (order_id);
create index if not exists vendor_credit_ledger_invoice_idx
  on public.vendor_credit_ledger (invoice_id);

-- ------------------------------------------------------------------
-- Credit applications per order (one application snapshot per order)
-- ------------------------------------------------------------------
create table if not exists public.order_credit_applications (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null,
  vendor_id uuid not null,
  order_id uuid not null,
  invoice_id uuid null,
  applied_amount numeric(12,2) not null check (applied_amount >= 0),
  note text null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id)
);

do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_credit_ledger_distributor_id_fkey'
        and conrelid = 'public.vendor_credit_ledger'::regclass
    ) then
      alter table public.vendor_credit_ledger
        add constraint vendor_credit_ledger_distributor_id_fkey
        foreign key (distributor_id) references public.profiles(id) on delete cascade not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_credit_ledger_vendor_id_fkey'
        and conrelid = 'public.vendor_credit_ledger'::regclass
    ) then
      alter table public.vendor_credit_ledger
        add constraint vendor_credit_ledger_vendor_id_fkey
        foreign key (vendor_id) references public.profiles(id) on delete cascade not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_credit_ledger_created_by_fkey'
        and conrelid = 'public.vendor_credit_ledger'::regclass
    ) then
      alter table public.vendor_credit_ledger
        add constraint vendor_credit_ledger_created_by_fkey
        foreign key (created_by) references public.profiles(id) on delete restrict not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_credit_applications_distributor_id_fkey'
        and conrelid = 'public.order_credit_applications'::regclass
    ) then
      alter table public.order_credit_applications
        add constraint order_credit_applications_distributor_id_fkey
        foreign key (distributor_id) references public.profiles(id) on delete cascade not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_credit_applications_vendor_id_fkey'
        and conrelid = 'public.order_credit_applications'::regclass
    ) then
      alter table public.order_credit_applications
        add constraint order_credit_applications_vendor_id_fkey
        foreign key (vendor_id) references public.profiles(id) on delete cascade not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_credit_applications_created_by_fkey'
        and conrelid = 'public.order_credit_applications'::regclass
    ) then
      alter table public.order_credit_applications
        add constraint order_credit_applications_created_by_fkey
        foreign key (created_by) references public.profiles(id) on delete restrict not valid;
    end if;
  end if;

  if to_regclass('public.orders') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_credit_ledger_order_id_fkey'
        and conrelid = 'public.vendor_credit_ledger'::regclass
    ) then
      alter table public.vendor_credit_ledger
        add constraint vendor_credit_ledger_order_id_fkey
        foreign key (order_id) references public.orders(id) on delete set null not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_credit_applications_order_id_fkey'
        and conrelid = 'public.order_credit_applications'::regclass
    ) then
      alter table public.order_credit_applications
        add constraint order_credit_applications_order_id_fkey
        foreign key (order_id) references public.orders(id) on delete cascade not valid;
    end if;
  end if;

  if to_regclass('public.invoices') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_credit_ledger_invoice_id_fkey'
        and conrelid = 'public.vendor_credit_ledger'::regclass
    ) then
      alter table public.vendor_credit_ledger
        add constraint vendor_credit_ledger_invoice_id_fkey
        foreign key (invoice_id) references public.invoices(id) on delete set null not valid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_credit_applications_invoice_id_fkey'
        and conrelid = 'public.order_credit_applications'::regclass
    ) then
      alter table public.order_credit_applications
        add constraint order_credit_applications_invoice_id_fkey
        foreign key (invoice_id) references public.invoices(id) on delete set null not valid;
    end if;
  end if;
end $$;

create index if not exists order_credit_applications_dist_vendor_created_idx
  on public.order_credit_applications (distributor_id, vendor_id, created_at desc);
create index if not exists order_credit_applications_order_idx
  on public.order_credit_applications (order_id);
create index if not exists order_credit_applications_invoice_idx
  on public.order_credit_applications (invoice_id);

set check_function_bodies = off;

create or replace function public.set_order_credit_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_order_credit_applications_updated_at on public.order_credit_applications;
create trigger set_order_credit_applications_updated_at
before update on public.order_credit_applications
for each row
execute function public.set_order_credit_applications_updated_at();

-- ------------------------------------------------------------------
-- Invoice snapshot field: credit_applied (does not change subtotal/total)
-- ------------------------------------------------------------------
do $$
begin
  if to_regclass('public.invoices') is not null then
    alter table public.invoices
      add column if not exists credit_applied numeric(12,2) not null default 0;
  end if;
end $$;

-- ------------------------------------------------------------------
-- RLS policies
-- ------------------------------------------------------------------
alter table public.vendor_credit_ledger enable row level security;
alter table public.order_credit_applications enable row level security;

drop policy if exists "vendor_credit_ledger: distributor manage own" on public.vendor_credit_ledger;
do $$
begin
  if to_regclass('public.distributor_vendors') is not null then
    execute $sql$
      create policy "vendor_credit_ledger: distributor manage own"
        on public.vendor_credit_ledger
        for all
        to authenticated
        using (auth.uid() = distributor_id)
        with check (
          auth.uid() = distributor_id
          and exists (
            select 1
            from public.distributor_vendors dv
            where dv.distributor_id = vendor_credit_ledger.distributor_id
              and dv.vendor_id = vendor_credit_ledger.vendor_id
          )
        )
    $sql$;
  else
    execute $sql$
      create policy "vendor_credit_ledger: distributor manage own"
        on public.vendor_credit_ledger
        for all
        to authenticated
        using (auth.uid() = distributor_id)
        with check (auth.uid() = distributor_id)
    $sql$;
  end if;
end $$;

drop policy if exists "vendor_credit_ledger: vendor read linked" on public.vendor_credit_ledger;
do $$
begin
  if to_regclass('public.distributor_vendors') is not null then
    execute $sql$
      create policy "vendor_credit_ledger: vendor read linked"
        on public.vendor_credit_ledger
        for select
        to authenticated
        using (
          auth.uid() = vendor_id
          and exists (
            select 1
            from public.distributor_vendors dv
            where dv.distributor_id = vendor_credit_ledger.distributor_id
              and dv.vendor_id = auth.uid()
          )
        )
    $sql$;
  else
    execute $sql$
      create policy "vendor_credit_ledger: vendor read linked"
        on public.vendor_credit_ledger
        for select
        to authenticated
        using (auth.uid() = vendor_id)
    $sql$;
  end if;
end $$;

drop policy if exists "order_credit_applications: distributor manage own" on public.order_credit_applications;
do $$
begin
  if to_regclass('public.orders') is not null then
    execute $sql$
      create policy "order_credit_applications: distributor manage own"
        on public.order_credit_applications
        for all
        to authenticated
        using (auth.uid() = distributor_id)
        with check (
          auth.uid() = distributor_id
          and exists (
            select 1
            from public.orders o
            where o.id = order_credit_applications.order_id
              and o.distributor_id = order_credit_applications.distributor_id
              and o.vendor_id = order_credit_applications.vendor_id
          )
        )
    $sql$;
  elsif to_regclass('public.distributor_vendors') is not null then
    execute $sql$
      create policy "order_credit_applications: distributor manage own"
        on public.order_credit_applications
        for all
        to authenticated
        using (auth.uid() = distributor_id)
        with check (
          auth.uid() = distributor_id
          and exists (
            select 1
            from public.distributor_vendors dv
            where dv.distributor_id = order_credit_applications.distributor_id
              and dv.vendor_id = order_credit_applications.vendor_id
          )
        )
    $sql$;
  else
    execute $sql$
      create policy "order_credit_applications: distributor manage own"
        on public.order_credit_applications
        for all
        to authenticated
        using (auth.uid() = distributor_id)
        with check (auth.uid() = distributor_id)
    $sql$;
  end if;
end $$;

drop policy if exists "order_credit_applications: vendor read linked" on public.order_credit_applications;
do $$
begin
  if to_regclass('public.distributor_vendors') is not null then
    execute $sql$
      create policy "order_credit_applications: vendor read linked"
        on public.order_credit_applications
        for select
        to authenticated
        using (
          auth.uid() = vendor_id
          and exists (
            select 1
            from public.distributor_vendors dv
            where dv.distributor_id = order_credit_applications.distributor_id
              and dv.vendor_id = auth.uid()
          )
        )
    $sql$;
  else
    execute $sql$
      create policy "order_credit_applications: vendor read linked"
        on public.order_credit_applications
        for select
        to authenticated
        using (auth.uid() = vendor_id)
    $sql$;
  end if;
end $$;

grant select, insert, update, delete on table public.vendor_credit_ledger to authenticated;
grant select, insert, update, delete on table public.order_credit_applications to authenticated;

-- ------------------------------------------------------------------
-- Sync helpers: keep invoice.credit_applied in sync with applications
-- ------------------------------------------------------------------
create or replace function public.invoices_set_credit_applied_from_order_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applied numeric(12,2) := 0;
begin
  select coalesce(oca.applied_amount, 0)::numeric(12,2)
    into v_applied
  from public.order_credit_applications oca
  where oca.order_id = new.order_id
  limit 1;

  new.credit_applied := coalesce(v_applied, 0);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.invoices') is not null then
    drop trigger if exists invoices_set_credit_applied_from_order_application on public.invoices;
    create trigger invoices_set_credit_applied_from_order_application
    before insert on public.invoices
    for each row
    execute function public.invoices_set_credit_applied_from_order_application();
  end if;
end $$;

create or replace function public.sync_invoice_credit_applied_from_order_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.invoices i
       set credit_applied = 0
     where i.order_id = old.order_id;
    return old;
  end if;

  update public.invoices i
     set credit_applied = coalesce(new.applied_amount, 0)
   where i.order_id = new.order_id;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.invoices') is not null then
    drop trigger if exists order_credit_applications_sync_invoice_credit on public.order_credit_applications;
    create trigger order_credit_applications_sync_invoice_credit
    after insert or update or delete on public.order_credit_applications
    for each row
    execute function public.sync_invoice_credit_applied_from_order_application();
  end if;
end $$;

-- ------------------------------------------------------------------
-- Atomic RPCs
-- ------------------------------------------------------------------
create or replace function public.add_vendor_credit(
  p_distributor_id uuid,
  p_vendor_id uuid,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_new_balance numeric(12,2);
  v_ledger_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from p_distributor_id then
    raise exception 'Not authorized to add credit for this distributor';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  if not exists (
    select 1
    from public.distributor_vendors dv
    where dv.distributor_id = p_distributor_id
      and dv.vendor_id = p_vendor_id
  ) then
    raise exception 'Vendor is not linked to this distributor';
  end if;

  v_amount := round(p_amount::numeric, 2);

  insert into public.vendor_credit_ledger (
    distributor_id,
    vendor_id,
    type,
    amount,
    note,
    created_by
  ) values (
    p_distributor_id,
    p_vendor_id,
    'credit_add',
    v_amount,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  ) returning id into v_ledger_id;

  select coalesce(round(sum(
    case
      when l.type = 'credit_add' then l.amount
      when l.type = 'credit_deduct' then -l.amount
      when l.type = 'credit_apply' then -l.amount
      when l.type = 'credit_reversal' then l.amount
      else 0
    end
  ), 2), 0)::numeric(12,2)
  into v_new_balance
  from public.vendor_credit_ledger l
  where l.distributor_id = p_distributor_id
    and l.vendor_id = p_vendor_id;

  return jsonb_build_object(
    'ok', true,
    'ledger_id', v_ledger_id,
    'new_balance', v_new_balance
  );
end;
$$;

create or replace function public.deduct_vendor_credit(
  p_distributor_id uuid,
  p_vendor_id uuid,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_balance numeric(12,2);
  v_new_balance numeric(12,2);
  v_ledger_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from p_distributor_id then
    raise exception 'Not authorized to deduct credit for this distributor';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  if not exists (
    select 1
    from public.distributor_vendors dv
    where dv.distributor_id = p_distributor_id
      and dv.vendor_id = p_vendor_id
  ) then
    raise exception 'Vendor is not linked to this distributor';
  end if;

  v_amount := round(p_amount::numeric, 2);

  select coalesce(round(sum(
    case
      when l.type = 'credit_add' then l.amount
      when l.type = 'credit_deduct' then -l.amount
      when l.type = 'credit_apply' then -l.amount
      when l.type = 'credit_reversal' then l.amount
      else 0
    end
  ), 2), 0)::numeric(12,2)
  into v_balance
  from public.vendor_credit_ledger l
  where l.distributor_id = p_distributor_id
    and l.vendor_id = p_vendor_id;

  if v_amount > v_balance then
    raise exception 'Deduction exceeds available credit balance';
  end if;

  insert into public.vendor_credit_ledger (
    distributor_id,
    vendor_id,
    type,
    amount,
    note,
    created_by
  ) values (
    p_distributor_id,
    p_vendor_id,
    'credit_deduct',
    v_amount,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  ) returning id into v_ledger_id;

  select coalesce(round(sum(
    case
      when l.type = 'credit_add' then l.amount
      when l.type = 'credit_deduct' then -l.amount
      when l.type = 'credit_apply' then -l.amount
      when l.type = 'credit_reversal' then l.amount
      else 0
    end
  ), 2), 0)::numeric(12,2)
  into v_new_balance
  from public.vendor_credit_ledger l
  where l.distributor_id = p_distributor_id
    and l.vendor_id = p_vendor_id;

  return jsonb_build_object(
    'ok', true,
    'ledger_id', v_ledger_id,
    'new_balance', v_new_balance
  );
end;
$$;

create or replace function public.apply_vendor_credit_to_order(
  p_distributor_id uuid,
  p_vendor_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_balance numeric(12,2);
  v_existing_applied numeric(12,2) := 0;
  v_delta numeric(12,2);
  v_order_subtotal numeric(12,2) := 0;
  v_order_adjustments numeric(12,2) := 0;
  v_order_tax numeric(12,2) := 0;
  v_order_total numeric(12,2) := 0;
  v_amount_due numeric(12,2) := 0;
  v_new_balance numeric(12,2) := 0;
  v_invoice_id uuid := null;
  v_application_id uuid := null;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() is distinct from p_distributor_id then
    raise exception 'Not authorized to apply credit for this distributor';
  end if;

  if not exists (
    select 1
    from public.distributor_vendors dv
    where dv.distributor_id = p_distributor_id
      and dv.vendor_id = p_vendor_id
  ) then
    raise exception 'Vendor is not linked to this distributor';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.distributor_id = p_distributor_id
      and o.vendor_id = p_vendor_id
      and o.deleted_at is null
  ) then
    raise exception 'Order not found for this distributor/vendor';
  end if;

  v_amount := round(greatest(coalesce(p_amount, 0), 0)::numeric, 2);

  select i.id, round(coalesce(i.total, 0), 2)::numeric(12,2)
    into v_invoice_id, v_order_total
  from public.invoices i
  where i.order_id = p_order_id
    and i.distributor_id = p_distributor_id
    and i.vendor_id = p_vendor_id
    and i.deleted_at is null
  order by i.created_at desc
  limit 1;

  if v_invoice_id is null then
    select round(coalesce(sum(
      greatest(coalesce(oi.edited_qty, oi.qty, 0), 0)::numeric
      * case
          when coalesce(oi.order_unit, 'piece') = 'case'
            then coalesce(oi.case_price_snapshot, oi.edited_unit_price, oi.unit_price, 0)
          else coalesce(oi.edited_unit_price, oi.unit_price, 0)
        end
    ), 0), 2)::numeric(12,2)
      into v_order_subtotal
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce(oi.removed, false) = false;

    select round(coalesce(sum(oa.amount), 0), 2)::numeric(12,2)
      into v_order_adjustments
    from public.order_adjustments oa
    where oa.order_id = p_order_id;

    v_order_subtotal := coalesce(v_order_subtotal, 0) + coalesce(v_order_adjustments, 0);

    select round(coalesce(sum(
      case
        when ot.type = 'percent' then v_order_subtotal * (coalesce(ot.rate_percent, 0) / 100.0)
        else coalesce(ot.rate_percent, 0)
      end
    ), 0), 2)::numeric(12,2)
      into v_order_tax
    from public.order_taxes ot
    where ot.order_id = p_order_id;

    v_order_total := round(coalesce(v_order_subtotal, 0) + coalesce(v_order_tax, 0), 2);
  end if;

  v_order_total := greatest(coalesce(v_order_total, 0), 0);

  if v_amount > v_order_total then
    raise exception 'Applied credit exceeds order total';
  end if;

  select oca.id, coalesce(oca.applied_amount, 0)::numeric(12,2)
    into v_application_id, v_existing_applied
  from public.order_credit_applications oca
  where oca.order_id = p_order_id
    and oca.distributor_id = p_distributor_id
    and oca.vendor_id = p_vendor_id
  limit 1;

  select coalesce(round(sum(
    case
      when l.type = 'credit_add' then l.amount
      when l.type = 'credit_deduct' then -l.amount
      when l.type = 'credit_apply' then -l.amount
      when l.type = 'credit_reversal' then l.amount
      else 0
    end
  ), 2), 0)::numeric(12,2)
  into v_balance
  from public.vendor_credit_ledger l
  where l.distributor_id = p_distributor_id
    and l.vendor_id = p_vendor_id;

  if v_amount > (v_balance + v_existing_applied) then
    raise exception 'Applied credit exceeds available vendor balance';
  end if;

  v_delta := round(v_amount - v_existing_applied, 2);

  if v_delta > 0 then
    insert into public.vendor_credit_ledger (
      distributor_id,
      vendor_id,
      type,
      amount,
      order_id,
      invoice_id,
      note,
      created_by
    ) values (
      p_distributor_id,
      p_vendor_id,
      'credit_apply',
      v_delta,
      p_order_id,
      v_invoice_id,
      nullif(trim(coalesce(p_note, '')), ''),
      auth.uid()
    );
  elsif v_delta < 0 then
    insert into public.vendor_credit_ledger (
      distributor_id,
      vendor_id,
      type,
      amount,
      order_id,
      invoice_id,
      note,
      created_by
    ) values (
      p_distributor_id,
      p_vendor_id,
      'credit_reversal',
      abs(v_delta),
      p_order_id,
      v_invoice_id,
      nullif(trim(coalesce(p_note, '')), ''),
      auth.uid()
    );
  end if;

  if v_amount = 0 then
    delete from public.order_credit_applications oca
    where oca.order_id = p_order_id
      and oca.distributor_id = p_distributor_id
      and oca.vendor_id = p_vendor_id;
  else
    insert into public.order_credit_applications (
      distributor_id,
      vendor_id,
      order_id,
      invoice_id,
      applied_amount,
      note,
      created_by
    ) values (
      p_distributor_id,
      p_vendor_id,
      p_order_id,
      v_invoice_id,
      v_amount,
      nullif(trim(coalesce(p_note, '')), ''),
      auth.uid()
    )
    on conflict (order_id)
    do update set
      invoice_id = coalesce(excluded.invoice_id, order_credit_applications.invoice_id),
      applied_amount = excluded.applied_amount,
      note = excluded.note,
      created_by = excluded.created_by,
      updated_at = now();
  end if;

  if v_invoice_id is not null then
    update public.invoices i
       set credit_applied = v_amount
     where i.id = v_invoice_id;
  end if;

  select coalesce(round(sum(
    case
      when l.type = 'credit_add' then l.amount
      when l.type = 'credit_deduct' then -l.amount
      when l.type = 'credit_apply' then -l.amount
      when l.type = 'credit_reversal' then l.amount
      else 0
    end
  ), 2), 0)::numeric(12,2)
  into v_new_balance
  from public.vendor_credit_ledger l
  where l.distributor_id = p_distributor_id
    and l.vendor_id = p_vendor_id;

  v_amount_due := greatest(round(v_order_total - v_amount, 2), 0);

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'invoice_id', v_invoice_id,
    'applied_amount', v_amount,
    'order_total', v_order_total,
    'amount_due', v_amount_due,
    'new_balance', v_new_balance
  );
end;
$$;

grant execute on function public.add_vendor_credit(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.add_vendor_credit(uuid, uuid, numeric, text) to service_role;

grant execute on function public.deduct_vendor_credit(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.deduct_vendor_credit(uuid, uuid, numeric, text) to service_role;

grant execute on function public.apply_vendor_credit_to_order(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.apply_vendor_credit_to_order(uuid, uuid, uuid, numeric, text) to service_role;

-- Backfill invoice snapshot from any existing order_credit_applications rows.
do $$
begin
  if to_regclass('public.invoices') is not null then
    update public.invoices i
    set credit_applied = coalesce(oca.applied_amount, 0)
    from public.order_credit_applications oca
    where oca.order_id = i.order_id
      and i.credit_applied is distinct from coalesce(oca.applied_amount, 0);
  end if;
end $$;

set check_function_bodies = on;
