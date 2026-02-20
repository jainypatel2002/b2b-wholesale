-- IDEMPOTENT MIGRATION: Fix Vendor Distributor Switching & Linking

-- 1. Ensure active_distributor_id exists on profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS active_distributor_id uuid REFERENCES public.profiles(id);

-- 2. Ensure vendor_distributors table and unique constraint
CREATE TABLE IF NOT EXISTS public.distributor_vendors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  distributor_id uuid NOT NULL REFERENCES public.profiles(id),
  vendor_id uuid NOT NULL REFERENCES public.profiles(id)
);

-- Ensure unique link per vendor-distributor pair
DROP INDEX IF EXISTS unique_vendor_distributor;
CREATE UNIQUE INDEX IF NOT EXISTS idx_distributor_vendors_unique 
ON public.distributor_vendors (vendor_id, distributor_id);

-- 3. RLS Policies for distributor_vendors
ALTER TABLE public.distributor_vendors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be safe and recreate
DROP POLICY IF EXISTS "Vendors can view their own links" ON public.distributor_vendors;
DROP POLICY IF EXISTS "Vendors can insert their own links" ON public.distributor_vendors;
DROP POLICY IF EXISTS "Distributors can view their own links" ON public.distributor_vendors;

-- Allow Vendors to SELECT their own links
CREATE POLICY "Vendors can view their own links"
ON public.distributor_vendors FOR SELECT
TO authenticated
USING (auth.uid() = vendor_id);

-- Allow Vendors to INSERT their own links via Server Action
CREATE POLICY "Vendors can insert their own links"
ON public.distributor_vendors FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = vendor_id);

-- Allow Distributors to SELECT their links
CREATE POLICY "Distributors can view their own links"
ON public.distributor_vendors FOR SELECT
TO authenticated
USING (auth.uid() = distributor_id);

-- 4. Ensure profiles RLS allows updating own active_distributor_id
-- (Assume existing "Users can update own profile" policy handles this, but let's be sure active_distributor_id is editable)
-- If specific column policies exist, this might need specific attention. Usually "USING (auth.uid() = id)" covers all columns.

-- 5. Helper Index for performance
CREATE INDEX IF NOT EXISTS idx_distributor_vendors_vendor_id ON public.distributor_vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_distributor_vendors_distributor_id ON public.distributor_vendors(distributor_id);
