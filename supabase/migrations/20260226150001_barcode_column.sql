-- Migration: Add barcode column to products table
-- Safe: additive only, all columns nullable, no existing data affected

-- 1. Add barcode column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text NULL;

-- 2. Add barcode_symbology column (future-proofing)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode_symbology text NULL;

-- 3. Composite index for fast lookups by distributor + barcode
CREATE INDEX IF NOT EXISTS products_distributor_barcode_idx
  ON public.products (distributor_id, barcode)
  WHERE barcode IS NOT NULL;

-- 4. Partial unique constraint (allows multiple NULLs, but enforces uniqueness per distributor when set)
CREATE UNIQUE INDEX IF NOT EXISTS products_distributor_barcode_uniq
  ON public.products (distributor_id, barcode)
  WHERE barcode IS NOT NULL;
