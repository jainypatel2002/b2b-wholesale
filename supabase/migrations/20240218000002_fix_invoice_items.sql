-- Migration: Fix Invoice Items Schema & RLS

-- 1. Add missing identification and inventory columns to invoice_items
ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS order_unit text NOT NULL DEFAULT 'piece',
ADD COLUMN IF NOT EXISTS cases_qty integer,
ADD COLUMN IF NOT EXISTS pieces_qty integer,
ADD COLUMN IF NOT EXISTS units_per_case_snapshot integer,
ADD COLUMN IF NOT EXISTS total_pieces integer;

-- 2. Ensure RLS Policies for Distributors
-- Distributors should be able to insert invoices and invoice_items for their own domain.

-- Policy for INVOICES (Insert)
DROP POLICY IF EXISTS "Distributors can insert their own invoices" ON public.invoices;
CREATE POLICY "Distributors can insert their own invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  distributor_id = auth.uid()
);

-- Policy for INVOICE ITEMS (Insert)
DROP POLICY IF EXISTS "Distributors can insert their own invoice items" ON public.invoice_items;
CREATE POLICY "Distributors can insert their own invoice items"
ON public.invoice_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_items.invoice_id
    AND invoices.distributor_id = auth.uid()
  )
);

-- 3. Notify PostgREST
NOTIFY pgrst, 'reload config';
