-- Idempotent Profit Center Migration
-- Safely adds columns for profit tracking without breaking if they exist

DO $$
BEGIN
  -- 1. selling_price_at_time
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='order_items' AND column_name='selling_price_at_time'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN selling_price_at_time numeric(10,2);
  END IF;

  -- 2. cost_price_at_time
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='order_items' AND column_name='cost_price_at_time'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN cost_price_at_time numeric(10,2);
  END IF;

  -- 3. cost_price on products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='products' AND column_name='cost_price'
  ) THEN
    ALTER TABLE public.products ADD COLUMN cost_price numeric(10,2);
  END IF;
END $$;
