-- ============================================================
-- Performance Indexes Migration
-- Created: 2026-02-28
-- Purpose: Add composite indexes on frequently filtered/sorted
--          columns to reduce query latency across all pages.
-- Safety:  All CREATE INDEX IF NOT EXISTS — fully idempotent.
--          No destructive changes. Safe to run multiple times.
-- ============================================================

-- Products: distributor inventory page (filter by distributor, exclude deleted, sort by created_at)
CREATE INDEX IF NOT EXISTS idx_products_distributor_active
  ON products (distributor_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Products: category filter on inventory page
CREATE INDEX IF NOT EXISTS idx_products_distributor_category
  ON products (distributor_id, category_id)
  WHERE deleted_at IS NULL;

-- Products: barcode lookup (scan feature)
CREATE INDEX IF NOT EXISTS idx_products_distributor_barcode
  ON products (distributor_id, barcode)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL;

-- Orders: distributor orders page (sort by created_at desc)
CREATE INDEX IF NOT EXISTS idx_orders_distributor_created
  ON orders (distributor_id, created_at DESC);

-- Orders: distributor orders filtered by status
CREATE INDEX IF NOT EXISTS idx_orders_distributor_status
  ON orders (distributor_id, status);

-- Orders: vendor orders page (sort by created_at desc)
CREATE INDEX IF NOT EXISTS idx_orders_vendor_created
  ON orders (vendor_id, created_at DESC);

-- Orders: active orders only (most common view)
CREATE INDEX IF NOT EXISTS idx_orders_distributor_active
  ON orders (distributor_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Invoices: distributor invoices page (sort by created_at desc)
CREATE INDEX IF NOT EXISTS idx_invoices_distributor_created
  ON invoices (distributor_id, created_at DESC);

-- Invoices: active invoices only
CREATE INDEX IF NOT EXISTS idx_invoices_distributor_active
  ON invoices (distributor_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Invoices: lookup by order_id (for order→invoice mapping)
CREATE INDEX IF NOT EXISTS idx_invoices_order_id
  ON invoices (order_id);

-- Distributor-Vendor links: vendor lookup (getVendorContext)
CREATE INDEX IF NOT EXISTS idx_distributor_vendors_vendor
  ON distributor_vendors (vendor_id);

-- Distributor-Vendor links: distributor lookup (getLinkedVendors)
CREATE INDEX IF NOT EXISTS idx_distributor_vendors_distributor
  ON distributor_vendors (distributor_id);

-- Notifications: user notifications sorted by recency
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Categories: distributor categories (catalog page)
CREATE INDEX IF NOT EXISTS idx_categories_distributor_active
  ON categories (distributor_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- Category nodes: lookup by category
CREATE INDEX IF NOT EXISTS idx_category_nodes_category
  ON category_nodes (category_id, distributor_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- Order items: lookup by order (for total calculation)
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);
