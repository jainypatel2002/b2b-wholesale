
-- 20260221_ensure_soft_delete.sql
-- Forcefully ensure deleted_at columns exist on orders and invoices, idempotently.

DO $$
BEGIN
  -- 1. Ensure orders has deleted_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;

  -- 2. Ensure invoices has deleted_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;

  -- 3. Ensure products has deleted_at (just in case)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'products' 
    AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.products ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;

END $$;
