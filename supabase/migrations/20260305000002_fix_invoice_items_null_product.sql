-- Migration: Fix Invoice Items product_id constraint
-- This allows manual items (shipping, fees, etc.) to be snapped into invoice_items 
-- without needing a linked inventory product.

ALTER TABLE public.invoice_items 
ALTER COLUMN product_id DROP NOT NULL;

-- Add a comment for clarification
COMMENT ON COLUMN public.invoice_items.product_id IS 'Link to products table. Null if is_manual is true (e.g. fees/adjustments).';
