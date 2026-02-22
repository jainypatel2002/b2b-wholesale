-- 20260301_invoice_system.sql
-- Create robust snapshot editing capabilities for professional invoicing

-- =========================================================
-- Part 1: Order Editing Extensions
-- Support adding pre-invoice manual adjustments (fees/shipping)
-- and pre-invoice taxes.
-- =========================================================

create table if not exists public.order_adjustments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    name text not null,
    amount numeric(10,2) not null default 0.00,
    created_at timestamptz not null default now()
);
create index if not exists order_adjustments_order_id_idx on public.order_adjustments(order_id);

create table if not exists public.order_taxes (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    name text not null,
    type text not null check (type in ('percent', 'fixed')),
    rate_percent numeric(5,2),
    created_at timestamptz not null default now()
);
create index if not exists order_taxes_order_id_idx on public.order_taxes(order_id);

-- RLS for Order Adjustments
alter table public.order_adjustments enable row level security;

drop policy if exists "Distributors can full access their order adjustments" on public.order_adjustments;
create policy "Distributors can full access their order adjustments"
  on public.order_adjustments
  for all to authenticated
  using (
      exists (
          select 1 from public.orders o
          where o.id = order_adjustments.order_id
          and o.distributor_id = auth.uid()
      )
  )
  with check (
      exists (
          select 1 from public.orders o
          where o.id = order_adjustments.order_id
          and o.distributor_id = auth.uid()
      )
  );

-- RLS for Order Taxes
alter table public.order_taxes enable row level security;

drop policy if exists "Distributors can full access their order taxes" on public.order_taxes;
create policy "Distributors can full access their order taxes"
  on public.order_taxes
  for all to authenticated
  using (
      exists (
          select 1 from public.orders o
          where o.id = order_taxes.order_id
          and o.distributor_id = auth.uid()
      )
  )
  with check (
      exists (
          select 1 from public.orders o
          where o.id = order_taxes.order_id
          and o.distributor_id = auth.uid()
      )
  );


-- =========================================================
-- Part 2: Extending the existing Invoice + Items tables
-- Adding necessary columns for the professional layout
-- =========================================================

alter table public.invoices add column if not exists terms text;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists tax_total numeric(10,2) not null default 0.00;

create index if not exists invoices_distributor_idx on public.invoices(distributor_id, created_at desc);
create index if not exists invoices_vendor_idx on public.invoices(vendor_id, created_at desc);

-- Invoice items strictly need to snapshot exactly the item code/name/quantity info
alter table public.invoice_items add column if not exists item_code text;
alter table public.invoice_items add column if not exists upc text;
alter table public.invoice_items add column if not exists category_name text;
alter table public.invoice_items add column if not exists effective_units numeric(12,2);
alter table public.invoice_items add column if not exists ext_amount numeric(12,2);
alter table public.invoice_items add column if not exists is_manual boolean not null default false;

create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);


-- =========================================================
-- Part 3: Invoice Taxes snapshot table
-- =========================================================

create table if not exists public.invoice_taxes (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    name text not null,
    type text not null check (type in ('percent', 'fixed')),
    rate_percent numeric(5,2),
    amount numeric(10,2) not null default 0.00,
    created_at timestamptz not null default now()
);
create index if not exists invoice_taxes_invoice_id_idx on public.invoice_taxes(invoice_id);

alter table public.invoice_taxes enable row level security;

drop policy if exists "Distributors can read their invoice taxes" on public.invoice_taxes;
create policy "Distributors can read their invoice taxes"
  on public.invoice_taxes for select to authenticated
  using (
      exists (select 1 from public.invoices i where i.id = invoice_taxes.invoice_id and i.distributor_id = auth.uid())
  );

drop policy if exists "Vendors can read their invoice taxes" on public.invoice_taxes;
create policy "Vendors can read their invoice taxes"
  on public.invoice_taxes for select to authenticated
  using (
      exists (select 1 from public.invoices i where i.id = invoice_taxes.invoice_id and i.vendor_id = auth.uid())
  );

-- Distributors create invoice snapshots during generation (via their RLS or service role bypassing RLS)
drop policy if exists "Distributors can create invoice taxes" on public.invoice_taxes;
create policy "Distributors can create invoice taxes"
  on public.invoice_taxes for insert to authenticated
  with check (
      exists (select 1 from public.invoices i where i.id = invoice_taxes.invoice_id and i.distributor_id = auth.uid())
  );

-- =========================================================
-- Part 4: Invoice Number Generation
-- Safe sequence function to prevent collisions in concurrent creation
-- =========================================================

-- In Supabase, sequences are global. To do per-distributor numbering safely 
-- without custom sequence tables, we count existing invoices and add 1.
-- Since this is executed within an atomic transaction inside the RPC or server action,
-- we'll rely on the server action inserting carefully. We'll provide a helper 
-- function to fetch and increment an internal sequence counter if needed, 
-- but a stable Short ID hash is much safer in serverless environments.
--
-- We will use a safe 6 character prefix: INV-XXXXXX 
-- The server action logic in TS will handle this directly based on the order ID slice (stable approach already in code),
-- but we'll ensure the column `invoice_number` remains indexed.
create index if not exists invoices_number_idx on public.invoices(distributor_id, invoice_number);
