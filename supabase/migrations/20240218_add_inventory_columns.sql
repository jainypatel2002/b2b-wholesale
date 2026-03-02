-- Migration: Add missing inventory columns to products table

-- 1. Add new columns if they don't exist
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS allow_case boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_piece boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS units_per_case integer,
ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS stock_pieces integer;

-- 2. Backfill stock_pieces from existing stock_qty (if stock_pieces is null)
-- We treat stock_qty as the legacy source of truth for now.
UPDATE public.products
SET stock_pieces = COALESCE(stock_pieces, stock_qty)
WHERE stock_pieces IS NULL;

-- 3. Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload config';
