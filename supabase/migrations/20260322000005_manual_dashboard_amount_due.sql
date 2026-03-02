-- 20260322000005_manual_dashboard_amount_due.sql
-- Manual dashboard-only amount due tracking.
-- Additive and safe: no destructive table drops.

-- 1) Store manual amount due on distributor<->vendor link rows.
alter table public.distributor_vendors
  add column if not exists manual_amount_due numeric(12,2) not null default 0;

alter table public.distributor_vendors
  add column if not exists manual_amount_due_updated_at timestamptz;

create index if not exists distributor_vendors_manual_due_idx
  on public.distributor_vendors (distributor_id, vendor_id, manual_amount_due_updated_at desc);

-- 2) Allow distributors to update manual amount due on their own links.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'distributor_vendors'
      and policyname = 'dv: distributor update own link'
  ) then
    create policy "dv: distributor update own link"
      on public.distributor_vendors
      for update
      using (auth.uid() = distributor_id)
      with check (auth.uid() = distributor_id);
  end if;
end $$;

-- 3) Ensure orders has a paid timestamp field available for manual "mark paid" overrides.
alter table public.orders
  add column if not exists paid_at timestamptz;

-- 4) Reset legacy stored computed due values to 0.
-- This does not alter order totals, invoice totals, line items, or tax math.
update public.orders
   set amount_due = 0
 where coalesce(amount_due, 0) <> 0;
