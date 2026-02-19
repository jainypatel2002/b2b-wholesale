-- Add columns for pricing modes and case prices
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'cost_case') then
    alter table products add column cost_case numeric;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'price_case') then
    alter table products add column price_case numeric;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'cost_mode') then
    alter table products add column cost_mode text default 'unit'; 
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'price_mode') then
    alter table products add column price_mode text default 'unit';
  end if;
end $$;
