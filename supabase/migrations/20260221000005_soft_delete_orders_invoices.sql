
-- Add deleted_at column to orders and invoices tables
do $$
begin
  -- Orders
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'deleted_at') then
    alter table orders add column deleted_at timestamptz default null;
  end if;

  -- Invoices
  if not exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'deleted_at') then
    alter table invoices add column deleted_at timestamptz default null;
  end if;
end $$;
