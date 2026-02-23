-- Migration: Invoice Snapshot Modernization
-- Standardizes snapshot columns for Invoice Items to support detailed print layout

-- 1. Add snapshot columns to invoice_items
alter table public.invoice_items
add column if not exists product_name_snapshot text,
add column if not exists category_name_snapshot text,
add column if not exists order_mode text,
add column if not exists quantity_snapshot numeric,
add column if not exists line_total_snapshot numeric;

-- 2. Backfill existing data for consistency
update public.invoice_items
set 
    product_name_snapshot = product_name,
    category_name_snapshot = category_name,
    order_mode = order_unit,
    quantity_snapshot = case 
        when order_unit = 'case' then coalesce(cases_qty, qty)
        else coalesce(pieces_qty, qty)
    end,
    line_total_snapshot = coalesce(ext_amount, (qty * unit_price));

-- 3. Update generate_invoice RPC to populate new fields
create or replace function public.generate_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_distributor_id uuid;
  v_vendor_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_item record;
  v_adj record;
  v_tax record;
begin
  -- 1. Identity & Permissions
  select distributor_id, vendor_id into v_distributor_id, v_vendor_id
  from public.orders
  where id = p_order_id;

  if v_distributor_id is null then 
    raise exception 'Order not found'; 
  end if;
  
  -- Security check: only the distributor who owns the order can generate the invoice
  if auth.uid() <> v_distributor_id then 
    raise exception 'Not authorized to generate invoice for this order'; 
  end if;

  -- 2. Prevent Double Invoicing
  select id into v_invoice_id from public.invoices where order_id = p_order_id;
  if v_invoice_id is not null then
    return v_invoice_id;
  end if;

  -- 3. Calculate Totals
  select coalesce(sum(
    coalesce(edited_unit_price, unit_price) * coalesce(edited_qty, qty)
  ), 0) into v_subtotal
  from public.order_items
  where order_id = p_order_id and removed = false;

  select v_subtotal + coalesce(sum(amount), 0) into v_subtotal
  from public.order_adjustments
  where order_id = p_order_id;

  for v_tax in select * from public.order_taxes where order_id = p_order_id loop
    if v_tax.type = 'percent' then
      v_tax_total := v_tax_total + (v_subtotal * (v_tax.rate_percent / 100));
    else
      v_tax_total := v_tax_total + v_tax.rate_percent;
    end if;
  end loop;

  v_tax_total := round(v_tax_total, 2);
  v_total := round(v_subtotal + v_tax_total, 2);

  -- 4. Create Invoice Header
  v_invoice_number := 'INV-' || upper(substring(p_order_id::text from 1 for 8));
  
  insert into public.invoices (
    distributor_id, vendor_id, order_id, invoice_number,
    subtotal, tax_total, tax, total,
    payment_method, payment_status,
    created_at
  ) values (
    v_distributor_id, v_vendor_id, p_order_id, v_invoice_number,
    round(v_subtotal, 2), v_tax_total, v_tax_total, v_total,
    'cash', 'unpaid',
    now()
  ) returning id into v_invoice_id;

  -- 5. Snapshot Items (Fixed for Canonical Model + Modern Snapshot fields)
  insert into public.invoice_items (
    invoice_id, product_id, product_name, qty, unit_price, unit_cost,
    unit_price_snapshot, case_price_snapshot,
    order_unit, cases_qty, pieces_qty, units_per_case_snapshot, total_pieces,
    effective_units, ext_amount, is_manual,
    -- Modern Snapshot fields
    product_name_snapshot, category_name_snapshot, order_mode, 
    quantity_snapshot, line_total_snapshot
  )
  select 
    v_invoice_id, oi.product_id, 
    coalesce(oi.edited_name, oi.product_name), 
    coalesce(oi.edited_qty, oi.qty),
    coalesce(oi.edited_unit_price, oi.unit_price),
    oi.unit_cost,
    coalesce(oi.edited_unit_price, oi.unit_price),
    case 
        when oi.order_unit = 'case' then coalesce(oi.edited_unit_price, oi.unit_price)
        else coalesce(oi.case_price_snapshot, oi.unit_price * oi.units_per_case_snapshot)
    end,
    oi.order_unit, oi.cases_qty, oi.pieces_qty, oi.units_per_case_snapshot, oi.total_pieces,
    coalesce(oi.edited_qty, oi.qty),
    round(coalesce(oi.edited_unit_price, oi.unit_price) * coalesce(oi.edited_qty, oi.qty), 2),
    false,
    -- Populate modern snapshot fields
    coalesce(oi.edited_name, oi.product_name),
    c.name, -- Derived from products -> categories
    oi.order_unit,
    coalesce(oi.edited_qty, oi.qty),
    round(coalesce(oi.edited_unit_price, oi.unit_price) * coalesce(oi.edited_qty, oi.qty), 2)
  from public.order_items oi
  left join public.products p on oi.product_id = p.id
  left join public.categories c on p.category_id = c.id
  where oi.order_id = p_order_id and oi.removed = false;

  -- 6. Snapshot Adjustments as Manual Items
  insert into public.invoice_items (
    invoice_id, product_name, qty, unit_price, unit_cost,
    order_unit, effective_units, ext_amount, is_manual,
    product_name_snapshot, order_mode, quantity_snapshot, line_total_snapshot
  )
  select 
    v_invoice_id, name, 1, amount, 0,
    'piece', 1, amount, true,
    name, 'piece', 1, amount
  from public.order_adjustments
  where order_id = p_order_id;

  -- 7. Snapshot Taxes
  insert into public.invoice_taxes (
    invoice_id, name, type, rate_percent, amount
  )
  select 
    v_invoice_id, name, type, rate_percent,
    case 
      when type = 'percent' then round(v_subtotal * (rate_percent / 100), 2)
      else round(rate_percent, 2)
    end
  from public.order_taxes
  where order_id = p_order_id;

  return v_invoice_id;
end;
$$;
