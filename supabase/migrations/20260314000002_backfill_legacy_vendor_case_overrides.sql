-- Backfill legacy single-field vendor overrides into explicit case overrides.
-- Historical vendor-pricing UI saved a single number as unit price even when case pricing was intended.
-- This migration maps those rows to case overrides for case-enabled products.

create table if not exists public.vendor_price_overrides_legacy_case_backfill_backup (
  override_id uuid primary key,
  price_per_unit numeric(10,4),
  price_per_case numeric(10,4),
  price_cents integer,
  backed_up_at timestamptz not null default now()
);

insert into public.vendor_price_overrides_legacy_case_backfill_backup (
  override_id,
  price_per_unit,
  price_per_case,
  price_cents,
  backed_up_at
)
select
  vpo.id,
  vpo.price_per_unit,
  vpo.price_per_case,
  vpo.price_cents,
  now()
from public.vendor_price_overrides vpo
join public.products p
  on p.id = vpo.product_id
 and p.distributor_id = vpo.distributor_id
where p.allow_case = true
  and vpo.price_per_case is null
  and vpo.price_per_unit is not null
on conflict (override_id) do nothing;

with legacy_rows as (
  select
    vpo.id,
    vpo.price_per_unit as legacy_override_value,
    greatest(coalesce(p.units_per_case, 1), 1)::numeric as units_per_case
  from public.vendor_price_overrides vpo
  join public.products p
    on p.id = vpo.product_id
   and p.distributor_id = vpo.distributor_id
  where p.allow_case = true
    and vpo.price_per_case is null
    and vpo.price_per_unit is not null
)
update public.vendor_price_overrides vpo
set
  price_per_case = legacy_rows.legacy_override_value,
  price_per_unit = null,
  price_cents = round((legacy_rows.legacy_override_value / legacy_rows.units_per_case) * 100)::integer,
  updated_at = now()
from legacy_rows
where legacy_rows.id = vpo.id;

comment on table public.vendor_price_overrides is
  'Per-vendor sell price overrides. Legacy single-value overrides are backfilled to explicit case overrides when case mode is enabled.';
