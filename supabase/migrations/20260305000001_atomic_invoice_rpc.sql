-- 20260305000001_atomic_invoice_rpc.sql
-- Implement a transaction-safe RPC for invoice generation to prevent data inconsistency or "disappearing" invoices.

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
  -- Ensure we use auth.uid() if called from client
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

  -- 3. Calculate Totals based on current order snapshots + edits
  -- Note: We calculate everything here to ensure the final stored values are consistent
  
  -- Item Subtotal (using effective values)
  select coalesce(sum(
    coalesce(edited_unit_price, unit_price) * coalesce(edited_qty, qty)
  ), 0) into v_subtotal
  from public.order_items
  where order_id = p_order_id and removed = false;

  -- Additional Subtotal from Adjustments
  select v_subtotal + coalesce(sum(amount), 0) into v_subtotal
  from public.order_adjustments
  where order_id = p_order_id;

  -- Taxes
  for v_tax in select * from public.order_taxes where order_id = p_order_id loop
    if v_tax.type = 'percent' then
      v_tax_total := v_tax_total + (v_subtotal * (v_tax.rate_percent / 100));
    else
      v_tax_total := v_tax_total + v_tax.rate_percent;
    end if;
  end loop;

  -- Rounding to 2 decimal places strictly
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

  -- 5. Snapshot Items
  insert into public.invoice_items (
    invoice_id, product_id, product_name, qty, unit_price, unit_cost,
    order_unit, cases_qty, pieces_qty, units_per_case_snapshot, total_pieces,
    effective_units, ext_amount, is_manual
  )
  select 
    v_invoice_id, product_id, 
    coalesce(edited_name, product_name), 
    coalesce(edited_qty, qty),
    coalesce(edited_unit_price, unit_price),
    unit_cost,
    order_unit, cases_qty, pieces_qty, units_per_case_snapshot, total_pieces,
    coalesce(edited_qty, qty),
    round(coalesce(edited_unit_price, unit_price) * coalesce(edited_qty, qty), 2),
    false
  from public.order_items
  where order_id = p_order_id and removed = false;

  -- 6. Snapshot Adjustments as Manual Items
  insert into public.invoice_items (
    invoice_id, product_name, qty, unit_price, unit_cost,
    order_unit, effective_units, ext_amount, is_manual
  )
  select 
    v_invoice_id, name, 1, amount, 0,
    'piece', 1, amount, true
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

  -- 8. Mark Order as Invoiced (optional depending on workflow, but good for tracking)
  -- If we had a column `invoiced_at`, we'd set it here.

  return v_invoice_id;
end;
$$;
