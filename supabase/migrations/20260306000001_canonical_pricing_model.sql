-- Migration: Canonical Pricing Model
-- Standardizes pricing columns for Products and Order Items

-- 1. Add canonical columns to Products
alter table public.products
add column if not exists cost_per_unit numeric(10,4) default 0,
add column if not exists sell_per_unit numeric(10,4) default 0,
add column if not exists cost_per_case numeric(10,4) null,
add column if not exists sell_per_case numeric(10,4) null;

-- 2. Backfill Product Data from legacy columns
update public.products
set 
    cost_per_unit = coalesce(cost_price, 0),
    sell_per_unit = coalesce(sell_price, 0),
    cost_per_case = cost_case,
    sell_per_case = price_case;

-- 3. Add canonical columns to Order Items
alter table public.order_items
add column if not exists case_price_snapshot numeric(10,4) null;

-- 4. Backfill Order Item Data
-- If it was a case order, snapshot the unit price into case price for consistency of old data if needed,
-- but the system usually stores unit price. For old case orders, total = qty * unit_price.
update public.order_items
set case_price_snapshot = unit_price_snapshot * units_per_case_snapshot
where order_unit = 'case' and units_per_case_snapshot is not null;

-- 5. Add canonical columns to Invoice Items
alter table public.invoice_items
add column if not exists case_price_snapshot numeric(10,4) null;

-- 6. Backfill Invoice Items
update public.invoice_items
set case_price_snapshot = unit_price_snapshot * units_per_case_snapshot
where order_unit = 'case' and units_per_case_snapshot is not null;

-- COMMENT for clarity
comment on column public.products.cost_per_unit is 'Canonical storage for unit cost';
comment on column public.products.sell_per_unit is 'Canonical storage for unit sell price';
comment on column public.products.cost_per_case is 'Explicit case cost override (if set)';
comment on column public.products.sell_per_case is 'Explicit case sell price override (if set)';
