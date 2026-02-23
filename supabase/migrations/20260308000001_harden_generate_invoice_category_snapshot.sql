-- Harden invoice generation: remove dependency on non-existent order_items.category_name
-- and snapshot category via products -> categories join.

alter table public.invoice_items
  add column if not exists category_id uuid,
  add column if not exists category_label text,
  add column if not exists category_name_snapshot text;

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
