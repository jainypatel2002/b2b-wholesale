-- Business Profiles + Invoice Header Snapshots
-- Adds a single source of truth for seller/buyer business identity
-- and snapshots it atomically during invoice generation.

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text,
  contact_name text,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'USA',
  tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_profiles_user_id_uidx
  on public.business_profiles(user_id);

alter table public.business_profiles enable row level security;

drop policy if exists "business_profiles: read own" on public.business_profiles;
create policy "business_profiles: read own"
on public.business_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "business_profiles: distributor read linked vendors" on public.business_profiles;
create policy "business_profiles: distributor read linked vendors"
on public.business_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'distributor'
  )
  and (
    exists (
      select 1
      from public.distributor_vendors dv
      where dv.distributor_id = auth.uid()
        and dv.vendor_id = business_profiles.user_id
    )
    or exists (
      select 1
      from public.orders o
      where o.distributor_id = auth.uid()
        and o.vendor_id = business_profiles.user_id
    )
  )
);

drop policy if exists "business_profiles: insert own" on public.business_profiles;
create policy "business_profiles: insert own"
on public.business_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "business_profiles: update own" on public.business_profiles;
create policy "business_profiles: update own"
on public.business_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_business_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_business_profiles_updated_at on public.business_profiles;
create trigger set_business_profiles_updated_at
before update on public.business_profiles
for each row
execute function public.set_business_profiles_updated_at();

alter table public.invoices
  add column if not exists seller_profile jsonb,
  add column if not exists buyer_profile jsonb;

create or replace function public.generate_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distributor_id uuid;
  v_vendor_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_tax record;
  v_seller_profile jsonb := '{}'::jsonb;
  v_buyer_profile jsonb := '{}'::jsonb;
begin
  -- Ensure order exists and lock row to reduce duplicate-generation races.
  select o.distributor_id, o.vendor_id
    into v_distributor_id, v_vendor_id
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_distributor_id is null then
    raise exception 'Order not found';
  end if;

  -- Only owning distributor can generate invoice.
  if auth.uid() is distinct from v_distributor_id then
    raise exception 'Not authorized to generate invoice for this order';
  end if;

  -- Idempotency guard.
  select i.id
    into v_invoice_id
  from public.invoices i
  where i.order_id = p_order_id
    and i.deleted_at is null
  limit 1;

  if v_invoice_id is not null then
    return v_invoice_id;
  end if;

  -- Defensive validation before writes.
  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.removed = false
      and oi.product_id is null
  ) then
    raise exception 'Cannot generate invoice: order item missing product_id';
  end if;

  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.removed = false
      and coalesce(oi.edited_unit_price, oi.unit_price) is null
  ) then
    raise exception 'Cannot generate invoice: order item missing unit_price';
  end if;

  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.removed = false
      and coalesce(oi.edited_qty, oi.qty) is null
  ) then
    raise exception 'Cannot generate invoice: order item missing qty';
  end if;

  -- Compute totals from effective (edited-or-original) values.
  select coalesce(sum(coalesce(oi.edited_unit_price, oi.unit_price) * coalesce(oi.edited_qty, oi.qty)), 0)
    into v_subtotal
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.removed = false;

  select v_subtotal + coalesce(sum(oa.amount), 0)
    into v_subtotal
  from public.order_adjustments oa
  where oa.order_id = p_order_id;

  for v_tax in
    select * from public.order_taxes ot where ot.order_id = p_order_id
  loop
    if v_tax.type = 'percent' then
      v_tax_total := v_tax_total + (v_subtotal * (v_tax.rate_percent / 100));
    else
      v_tax_total := v_tax_total + v_tax.rate_percent;
    end if;
  end loop;

  v_tax_total := round(v_tax_total, 2);
  v_total := round(v_subtotal + v_tax_total, 2);
  v_invoice_number := 'INV-' || upper(substring(p_order_id::text from 1 for 8));

  -- Snapshot seller (distributor) profile for invoice immutability.
  select jsonb_build_object(
    'business_name', coalesce(bp.business_name, p.display_name, p.email, ''),
    'contact_name', coalesce(bp.contact_name, ''),
    'email', coalesce(bp.email, p.email, ''),
    'phone', coalesce(bp.phone, p.phone, ''),
    'address_line1', coalesce(bp.address_line1, p.location_address, ''),
    'address_line2', coalesce(bp.address_line2, ''),
    'city', coalesce(bp.city, ''),
    'state', coalesce(bp.state, ''),
    'postal_code', coalesce(bp.postal_code, ''),
    'country', coalesce(bp.country, 'USA'),
    'tax_id', coalesce(bp.tax_id, ''),
    'notes', coalesce(bp.notes, '')
  )
  into v_seller_profile
  from public.profiles p
  left join public.business_profiles bp on bp.user_id = p.id
  where p.id = v_distributor_id;

  -- Snapshot buyer (vendor) profile for invoice immutability.
  select jsonb_build_object(
    'business_name', coalesce(bp.business_name, p.display_name, p.email, ''),
    'contact_name', coalesce(bp.contact_name, ''),
    'email', coalesce(bp.email, p.email, ''),
    'phone', coalesce(bp.phone, p.phone, ''),
    'address_line1', coalesce(bp.address_line1, p.location_address, ''),
    'address_line2', coalesce(bp.address_line2, ''),
    'city', coalesce(bp.city, ''),
    'state', coalesce(bp.state, ''),
    'postal_code', coalesce(bp.postal_code, ''),
    'country', coalesce(bp.country, 'USA'),
    'tax_id', coalesce(bp.tax_id, ''),
    'notes', coalesce(bp.notes, '')
  )
  into v_buyer_profile
  from public.profiles p
  left join public.business_profiles bp on bp.user_id = p.id
  where p.id = v_vendor_id;

  v_seller_profile := coalesce(
    v_seller_profile,
    jsonb_build_object(
      'business_name', '',
      'contact_name', '',
      'email', '',
      'phone', '',
      'address_line1', '',
      'address_line2', '',
      'city', '',
      'state', '',
      'postal_code', '',
      'country', 'USA',
      'tax_id', '',
      'notes', ''
    )
  );

  v_buyer_profile := coalesce(
    v_buyer_profile,
    jsonb_build_object(
      'business_name', '',
      'contact_name', '',
      'email', '',
      'phone', '',
      'address_line1', '',
      'address_line2', '',
      'city', '',
      'state', '',
      'postal_code', '',
      'country', 'USA',
      'tax_id', '',
      'notes', ''
    )
  );

  -- Guardrail: warn but do not fail if required profile fields are incomplete.
  if coalesce(v_seller_profile->>'business_name', '') = ''
    or coalesce(v_seller_profile->>'address_line1', '') = ''
    or coalesce(v_seller_profile->>'city', '') = ''
    or coalesce(v_seller_profile->>'state', '') = ''
    or coalesce(v_seller_profile->>'postal_code', '') = ''
    or coalesce(v_seller_profile->>'phone', '') = ''
    or coalesce(v_seller_profile->>'email', '') = ''
  then
    raise notice 'generate_invoice: seller business profile incomplete for distributor %', v_distributor_id;
  end if;

  if coalesce(v_buyer_profile->>'business_name', '') = ''
    or coalesce(v_buyer_profile->>'address_line1', '') = ''
    or coalesce(v_buyer_profile->>'city', '') = ''
    or coalesce(v_buyer_profile->>'state', '') = ''
    or coalesce(v_buyer_profile->>'postal_code', '') = ''
    or coalesce(v_buyer_profile->>'phone', '') = ''
    or coalesce(v_buyer_profile->>'email', '') = ''
  then
    raise notice 'generate_invoice: buyer business profile incomplete for vendor %', v_vendor_id;
  end if;

  insert into public.invoices (
    distributor_id,
    vendor_id,
    order_id,
    invoice_number,
    subtotal,
    tax_total,
    tax,
    total,
    payment_method,
    payment_status,
    seller_profile,
    buyer_profile,
    created_at
  )
  values (
    v_distributor_id,
    v_vendor_id,
    p_order_id,
    v_invoice_number,
    round(v_subtotal, 2),
    v_tax_total,
    v_tax_total,
    v_total,
    'cash',
    'unpaid',
    v_seller_profile,
    v_buyer_profile,
    now()
  )
  returning id into v_invoice_id;

  -- Snapshot order lines. Category is resolved via products -> categories.
  insert into public.invoice_items (
    invoice_id,
    product_id,
    product_name,
    qty,
    unit_price,
    unit_cost,
    unit_price_snapshot,
    case_price_snapshot,
    order_unit,
    cases_qty,
    pieces_qty,
    units_per_case_snapshot,
    total_pieces,
    effective_units,
    ext_amount,
    is_manual,
    product_name_snapshot,
    category_name_snapshot,
    order_mode,
    quantity_snapshot,
    line_total_snapshot,
    category_id,
    category_label
  )
  select
    v_invoice_id,
    oi.product_id,
    coalesce(oi.edited_name, oi.product_name, p.name, 'Unknown Item'),
    coalesce(oi.edited_qty, oi.qty)::integer,
    coalesce(oi.edited_unit_price, oi.unit_price),
    coalesce(oi.unit_cost, 0),
    coalesce(oi.edited_unit_price, oi.unit_price),
    case
      when coalesce(oi.order_unit, 'piece') = 'case' then coalesce(oi.edited_unit_price, oi.unit_price)
      else coalesce(
        oi.case_price_snapshot,
        coalesce(oi.edited_unit_price, oi.unit_price) * greatest(coalesce(oi.units_per_case_snapshot, 1), 1)
      )
    end,
    coalesce(oi.order_unit, 'piece'),
    coalesce(oi.cases_qty, 0),
    coalesce(oi.pieces_qty, 0),
    coalesce(oi.units_per_case_snapshot, 1),
    coalesce(
      oi.total_pieces,
      case
        when coalesce(oi.order_unit, 'piece') = 'case'
          then (coalesce(oi.edited_qty, oi.qty) * greatest(coalesce(oi.units_per_case_snapshot, 1), 1))::integer
        else coalesce(oi.edited_qty, oi.qty)::integer
      end
    ),
    coalesce(oi.edited_qty, oi.qty),
    round(coalesce(oi.edited_unit_price, oi.unit_price) * coalesce(oi.edited_qty, oi.qty), 2),
    false,
    coalesce(oi.edited_name, oi.product_name, p.name, 'Unknown Item'),
    c.name,
    coalesce(oi.order_unit, 'piece'),
    coalesce(oi.edited_qty, oi.qty),
    round(coalesce(oi.edited_unit_price, oi.unit_price) * coalesce(oi.edited_qty, oi.qty), 2),
    p.category_id,
    c.name
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  left join public.categories c on c.id = p.category_id
  where oi.order_id = p_order_id
    and oi.removed = false;

  -- Snapshot non-product adjustments as manual lines.
  insert into public.invoice_items (
    invoice_id,
    product_name,
    qty,
    unit_price,
    unit_cost,
    order_unit,
    effective_units,
    ext_amount,
    is_manual,
    product_name_snapshot,
    order_mode,
    quantity_snapshot,
    line_total_snapshot,
    category_label
  )
  select
    v_invoice_id,
    oa.name,
    1,
    oa.amount,
    0,
    'piece',
    1,
    oa.amount,
    true,
    oa.name,
    'piece',
    1,
    oa.amount,
    'Adjustment'
  from public.order_adjustments oa
  where oa.order_id = p_order_id;

  insert into public.invoice_taxes (
    invoice_id,
    name,
    type,
    rate_percent,
    amount
  )
  select
    v_invoice_id,
    ot.name,
    ot.type,
    ot.rate_percent,
    case
      when ot.type = 'percent' then round(v_subtotal * (ot.rate_percent / 100), 2)
      else round(ot.rate_percent, 2)
    end
  from public.order_taxes ot
  where ot.order_id = p_order_id;

  return v_invoice_id;
end;
$$;
