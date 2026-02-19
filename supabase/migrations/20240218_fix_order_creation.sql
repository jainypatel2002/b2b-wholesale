-- Migration: Fix Order Creation (Schema & RLS)

-- 1. Ensure order_items has the required columns for the new inventory system
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS order_unit text NOT NULL DEFAULT 'piece',
ADD COLUMN IF NOT EXISTS cases_qty integer,
ADD COLUMN IF NOT EXISTS pieces_qty integer,
ADD COLUMN IF NOT EXISTS units_per_case_snapshot integer,
ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pieces integer;

-- 2. Ensure RLS Policy exists for Vendors to insert into order_items
-- Drop existing policy if it exists to avoid conflicts/duplicates
DROP POLICY IF EXISTS "Vendors can insert their own order items" ON public.order_items;

-- Create policy: Logic - Users can insert row IF the linked Order belongs to them
CREATE POLICY "Vendors can insert their own order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.vendor_id = auth.uid()
  )
);

-- 3. Ensure Vendors can view their own order items (if not already set)
DROP POLICY IF EXISTS "Vendors can view their own order items" ON public.order_items;

CREATE POLICY "Vendors can view their own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.vendor_id = auth.uid()
  )
);

-- 4. Notify to refresh schema cache
NOTIFY pgrst, 'reload config';
