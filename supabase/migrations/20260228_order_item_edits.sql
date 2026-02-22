-- ============================================================
-- Order Item Edits Migration
-- Purpose: Allow distributors to edit order items before invoice
-- Safety: All ADD COLUMN IF NOT EXISTS — fully idempotent
-- ============================================================

-- Edit overlay columns on order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS edited_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS edited_unit_price numeric;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS edited_qty numeric;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS removed boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS edited_by uuid;

-- RLS: Distributors can UPDATE order_items for their own orders
DROP POLICY IF EXISTS "Distributors can update order items for non-invoiced orders" ON public.order_items;

CREATE POLICY "Distributors can update order items for non-invoiced orders"
ON public.order_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.distributor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.distributor_id = auth.uid()
  )
);
