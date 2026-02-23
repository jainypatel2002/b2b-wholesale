-- STRICT VENDOR SCOPING MIGRATION
-- Enforce that Vendors can ONLY see data belonging to their ACTIVE distributor.

-- 1. Helper Function to get Current User's Active Distributor
-- This avoids repeating the subquery in every policy and makes it cleaner/faster.
CREATE OR REPLACE FUNCTION public.get_my_active_distributor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT active_distributor_id 
  FROM public.profiles 
  WHERE id = auth.uid()
$$;

-- 2. PRODUCTS Policy
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view products from active distributor" ON public.products;
DROP POLICY IF EXISTS "Distributors can view own products" ON public.products;
DROP POLICY IF EXISTS "Distributors can insert own products" ON public.products;
DROP POLICY IF EXISTS "Distributors can update own products" ON public.products;
DROP POLICY IF EXISTS "Distributors can delete own products" ON public.products;

-- Vendor Policy: STRICT SCOPING
CREATE POLICY "Vendors can view products from active distributor"
ON public.products FOR SELECT
TO authenticated
USING (
  (auth.uid() = distributor_id) -- Distributor viewing own
  OR 
  (distributor_id = public.get_my_active_distributor_id()) -- Vendor viewing active
);

-- Distributor Write Policies (Standard)
CREATE POLICY "Distributors can insert own products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = distributor_id);

CREATE POLICY "Distributors can update own products"
ON public.products FOR UPDATE
TO authenticated
USING (auth.uid() = distributor_id);

CREATE POLICY "Distributors can delete own products"
ON public.products FOR DELETE
TO authenticated
USING (auth.uid() = distributor_id);


-- 3. CATEGORIES Policy
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
-- (Assuming standard policies exist, we replace the SELECT one for strictness)
DROP POLICY IF EXISTS "Vendors can view categories from active distributor" ON public.categories;
-- ... drop others if needed to avoid conflicts, or just create new one if unique name

CREATE POLICY "Vendors can view categories from active distributor"
ON public.categories FOR SELECT
TO authenticated
USING (
  (auth.uid() = distributor_id)
  OR 
  (distributor_id = public.get_my_active_distributor_id())
);

-- 4. ORDERS Policy
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Distributors can view received orders" ON public.orders;

-- Vendor: View Own (Standard)
CREATE POLICY "Vendors can view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (auth.uid() = vendor_id);

-- Distributor: View Received
CREATE POLICY "Distributors can view received orders"
ON public.orders FOR SELECT
TO authenticated
USING (auth.uid() = distributor_id);

-- Vendor: INSERT (Strict - must be for active distributor)
CREATE POLICY "Vendors can insert orders for active distributor"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = vendor_id
  AND
  distributor_id = public.get_my_active_distributor_id()
);

-- Note: Invoices and Order Items typically follow similar patterns or inherit via relation if using sophisticated RLS, 
-- but explicit policies are safer.

-- 5. ORDER ITEMS Policy
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order items they have access to via order"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
    AND (orders.vendor_id = auth.uid() OR orders.distributor_id = auth.uid())
  )
);
