-- Profit Center Migration
-- 1. Ensure products has cost_price
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(10,2);

-- 2. Add snapshot columns to order_items
-- We use new specific names as requested to avoid confusion with legacy fields
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selling_price_at_time numeric(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price_at_time numeric(10,2);

-- 3. Add index for analytics performance
-- Indexing distributor_id on orders is crucial for "getProfitOverview(distributorId)"
CREATE INDEX IF NOT EXISTS idx_orders_distributor_id ON orders(distributor_id);

-- Indexing created_at on orders allows fast date range filtering
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Indexing product_id on order_items for product profitability
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
