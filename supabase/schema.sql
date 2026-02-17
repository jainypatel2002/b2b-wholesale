-- Distributor/Vendor Portal schema (Supabase Postgres)
-- Run this in Supabase SQL Editor.

-- Extensions
create extension if not exists "pgcrypto";

-- =====================
-- Profiles (one per auth user)
-- =====================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text check (role in ('distributor','vendor')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Profile policies
create policy "profiles: read own" on public.profiles
for select using (auth.uid() = id);

create policy "profiles: update own" on public.profiles
for update using (auth.uid() = id);

-- =====================
-- Vendor linked to distributor
-- =====================
create table if not exists public.distributor_vendors (
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (distributor_id, vendor_id)
);

alter table public.distributor_vendors enable row level security;

create policy "dv: distributor sees their vendors" on public.distributor_vendors
for select using (auth.uid() = distributor_id);

create policy "dv: vendor sees their link" on public.distributor_vendors
for select using (auth.uid() = vendor_id);

create policy "dv: vendor can create link (onboarding)" on public.distributor_vendors
for insert with check (auth.uid() = vendor_id);

-- =====================
-- Categories
-- =====================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (distributor_id, name)
);

alter table public.categories enable row level security;

create policy "categories: distributor CRUD" on public.categories
for all using (auth.uid() = distributor_id)
with check (auth.uid() = distributor_id);

create policy "categories: vendor read via link" on public.categories
for select using (
  exists (
    select 1 from public.distributor_vendors dv
    where dv.vendor_id = auth.uid() and dv.distributor_id = categories.distributor_id
  )
);

-- =====================
-- Products
-- =====================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  sku text,
  cost_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  stock_qty int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists products_distributor_idx on public.products (distributor_id);
create index if not exists products_category_idx on public.products (category_id);

alter table public.products enable row level security;

create policy "products: distributor CRUD" on public.products
for all using (auth.uid() = distributor_id)
with check (auth.uid() = distributor_id);

create policy "products: vendor read via link" on public.products
for select using (
  active = true and exists (
    select 1 from public.distributor_vendors dv
    where dv.vendor_id = auth.uid() and dv.distributor_id = products.distributor_id
  )
);

-- =====================
-- Orders
-- =====================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'placed' check (status in ('placed','accepted','fulfilled','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists orders_distributor_idx on public.orders (distributor_id);
create index if not exists orders_vendor_idx on public.orders (vendor_id);

alter table public.orders enable row level security;

-- Distributor can see/update their orders
create policy "orders: distributor read" on public.orders
for select using (auth.uid() = distributor_id);

create policy "orders: distributor update" on public.orders
for update using (auth.uid() = distributor_id);

-- Vendor can see their orders
create policy "orders: vendor read" on public.orders
for select using (auth.uid() = vendor_id);

-- Vendor can create orders only if linked to distributor
create policy "orders: vendor insert" on public.orders
for insert with check (
  auth.uid() = vendor_id and exists (
    select 1 from public.distributor_vendors dv
    where dv.vendor_id = auth.uid() and dv.distributor_id = distributor_id
  )
);

-- =====================
-- Order Items (snapshot unit_price + unit_cost)
-- =====================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.order_items enable row level security;

-- Distributor reads items for their orders
create policy "order_items: distributor read" on public.order_items
for select using (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.distributor_id = auth.uid())
);

-- Vendor reads items for their orders
create policy "order_items: vendor read" on public.order_items
for select using (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.vendor_id = auth.uid())
);

-- Vendor inserts items only for their own order
create policy "order_items: vendor insert" on public.order_items
for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.vendor_id = auth.uid())
);

-- =====================
-- Invoices
-- =====================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  invoice_number text not null,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invoices_distributor_idx on public.invoices (distributor_id);
create index if not exists invoices_vendor_idx on public.invoices (vendor_id);

alter table public.invoices enable row level security;

create policy "invoices: distributor CRUD" on public.invoices
for all using (auth.uid() = distributor_id)
with check (auth.uid() = distributor_id);

create policy "invoices: vendor read" on public.invoices
for select using (auth.uid() = vendor_id);

-- =====================
-- Invoice items
-- =====================
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);

alter table public.invoice_items enable row level security;

create policy "invoice_items: distributor read" on public.invoice_items
for select using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.distributor_id = auth.uid())
);

create policy "invoice_items: distributor insert" on public.invoice_items
for insert with check (
  exists (select 1 from public.invoices i where i.id = invoice_id and i.distributor_id = auth.uid())
);

create policy "invoice_items: vendor read" on public.invoice_items
for select using (
  exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.vendor_id = auth.uid())
);
