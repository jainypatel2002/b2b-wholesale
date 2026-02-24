-- Add vendor favorites + vendor order note (additive, idempotent)

create table if not exists public.vendor_favorites (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (vendor_id, product_id)
);

create index if not exists vendor_favorites_vendor_idx
  on public.vendor_favorites (vendor_id);

create index if not exists vendor_favorites_vendor_product_idx
  on public.vendor_favorites (vendor_id, product_id);

alter table public.vendor_favorites enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_favorites'
      and policyname = 'vendor_favorites: vendor read own'
  ) then
    create policy "vendor_favorites: vendor read own"
      on public.vendor_favorites
      for select
      to authenticated
      using (auth.uid() = vendor_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_favorites'
      and policyname = 'vendor_favorites: vendor insert own'
  ) then
    create policy "vendor_favorites: vendor insert own"
      on public.vendor_favorites
      for insert
      to authenticated
      with check (
        auth.uid() = vendor_id
        and exists (
          select 1
          from public.products p
          join public.distributor_vendors dv
            on dv.distributor_id = p.distributor_id
          where p.id = vendor_favorites.product_id
            and dv.vendor_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_favorites'
      and policyname = 'vendor_favorites: vendor delete own'
  ) then
    create policy "vendor_favorites: vendor delete own"
      on public.vendor_favorites
      for delete
      to authenticated
      using (auth.uid() = vendor_id);
  end if;
end $$;

grant select, insert, delete on table public.vendor_favorites to authenticated;

alter table public.orders
  add column if not exists vendor_note text;
