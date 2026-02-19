-- Add missing snapshot columns to order_items
alter table public.order_items
  add column if not exists product_name text;

alter table public.order_items
  add column if not exists order_unit text; -- 'piece' or 'case'

alter table public.order_items
  add column if not exists cases_qty numeric;

alter table public.order_items
  add column if not exists pieces_qty numeric;

alter table public.order_items
  add column if not exists units_per_case_snapshot numeric;

alter table public.order_items
  add column if not exists unit_price_snapshot numeric;

alter table public.order_items
  add column if not exists total_pieces numeric;

alter table public.order_items
  add column if not exists selling_price_at_time numeric;

alter table public.order_items
  add column if not exists cost_price_at_time numeric;

alter table public.order_items
  add column if not exists qty numeric; -- Legacy but likely exists

alter table public.order_items
  add column if not exists unit_price numeric; -- Legacy but likely exists

alter table public.order_items
  add column if not exists unit_cost numeric; -- Legacy but likely exists


-- Add similar columns to invoice_items to be safe for future features
alter table public.invoice_items
  add column if not exists product_name text;

alter table public.invoice_items
  add column if not exists order_unit text;

alter table public.invoice_items
  add column if not exists cases_qty numeric;

alter table public.invoice_items
  add column if not exists pieces_qty numeric;

alter table public.invoice_items
  add column if not exists units_per_case_snapshot numeric;

alter table public.invoice_items
  add column if not exists unit_price_snapshot numeric;

alter table public.invoice_items
  add column if not exists total_pieces numeric;
