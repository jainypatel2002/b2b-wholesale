
-- 20260221_permanent_soft_delete_fix.sql
-- Consolidated migration for Soft Delete (Archive) support

-- 1. Ensure deleted_at columns exist (Idempotent)
DO $$
BEGIN
  -- Products
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='deleted_at') THEN
    ALTER TABLE public.products ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;

  -- Orders
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='deleted_at') THEN
    ALTER TABLE public.orders ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;

  -- Invoices
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='deleted_at') THEN
    ALTER TABLE public.invoices ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- 2. RLS Policies for Soft Delete (UPDATE deleted_at)

-- Products: Distributor can archive their own products
-- Check if policy exists before creating (or drop and recreate to be safe/idempotent-ish via DO block, but simplified here for appending)
DROP POLICY IF EXISTS "distributor_archive_products" ON products;
CREATE POLICY "distributor_archive_products"
ON products FOR UPDATE
TO authenticated
USING (auth.uid() = distributor_id)
WITH CHECK (auth.uid() = distributor_id);

-- Orders: Distributor can archive their own orders
DROP POLICY IF EXISTS "distributor_archive_orders" ON orders;
CREATE POLICY "distributor_archive_orders"
ON orders FOR UPDATE
TO authenticated
USING (auth.uid() = distributor_id)
WITH CHECK (auth.uid() = distributor_id);

-- Orders: Vendor can archive their own orders
DROP POLICY IF EXISTS "vendor_archive_orders" ON orders;
CREATE POLICY "vendor_archive_orders"
ON orders FOR UPDATE
TO authenticated
USING (auth.uid() = vendor_id)
WITH CHECK (auth.uid() = vendor_id);

-- Invoices: Distributor can archive their own invoices
DROP POLICY IF EXISTS "distributor_archive_invoices" ON invoices;
CREATE POLICY "distributor_archive_invoices"
ON invoices FOR UPDATE
TO authenticated
USING (auth.uid() = distributor_id)
WITH CHECK (auth.uid() = distributor_id);
