
-- Add stock_mode column to products table
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'stock_mode') then
    alter table products add column stock_mode text default 'pieces';
  end if;
end $$;
