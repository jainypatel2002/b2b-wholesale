-- Migration: Fix Invoice Math
-- Corrects incorrect backfilled snapshots where case prices were double-multiplied

-- 1. Fix order_items snapshots
-- If order_unit was 'case', unit_price (and unit_price_snapshot) already stores the case price.
-- We should NOT multiply it again by units_per_case.
update public.order_items
set case_price_snapshot = unit_price_snapshot
where order_unit = 'case' 
  and case_price_snapshot > (unit_price_snapshot * 1.0) -- Only fix if it looks like it was multiplied
  and units_per_case_snapshot > 1;

-- 2. Fix invoice_items snapshots
update public.invoice_items
set case_price_snapshot = unit_price_snapshot
where order_unit = 'case'
  and case_price_snapshot > (unit_price_snapshot * 1.0)
  and units_per_case_snapshot > 1;

-- 3. Ensure line_total_snapshot is correct (Source of Truth)
-- qty in normalized terms for cases is the number of cases.
-- total = qty * price_of_ordered_unit
update public.invoice_items
set line_total_snapshot = qty * unit_price
where line_total_snapshot <> (qty * unit_price)
  and is_manual = false;

-- 4. Re-calculate subtotal and total in invoices if they were calculated from incorrect line totals
-- This is risky, but the user said "Restore correct pricing math".
-- Usually subtotal = sum(invoice_items.line_total_snapshot)
update public.invoices i
set 
    subtotal = (
        select coalesce(sum(line_total_snapshot), 0)
        from public.invoice_items
        where invoice_id = i.id
    ),
    total = (
        select coalesce(sum(line_total_snapshot), 0)
        from public.invoice_items
        where invoice_id = i.id
    ) + coalesce(tax_total, 0);
