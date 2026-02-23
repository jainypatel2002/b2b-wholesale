-- ============================================================
-- Fix Bulk Pricing: Audit Logging + Negative Guard + Cleanup
-- Idempotent: all IF NOT EXISTS / OR REPLACE
-- ============================================================

-- 1. Enhance audit tables with missing columns
ALTER TABLE public.price_change_batches
  ADD COLUMN IF NOT EXISTS apply_mode text,        -- 'base_only' | 'base_and_overrides' | 'overrides_only'
  ADD COLUMN IF NOT EXISTS change_type text,        -- 'percent' | 'fixed' | 'set'
  ADD COLUMN IF NOT EXISTS field text,              -- 'sell_price' | 'price_case' | 'cost_price'
  ADD COLUMN IF NOT EXISTS value_applied numeric,   -- the value that was applied
  ADD COLUMN IF NOT EXISTS reason text;             -- optional reason/notes

ALTER TABLE public.price_change_items
  ADD COLUMN IF NOT EXISTS product_name text;       -- human-readable snapshot

-- Allow insert into audit tables for the SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Price change batches: distributor insert" ON public.price_change_batches;
CREATE POLICY "Price change batches: distributor insert" ON public.price_change_batches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = distributor_id);

DROP POLICY IF EXISTS "Price change items: system insert" ON public.price_change_items;
CREATE POLICY "Price change items: system insert" ON public.price_change_items
  FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Drop old broken RPC (references non-existent 'price' column)
DROP FUNCTION IF EXISTS execute_bulk_price_adjustment(uuid, text, uuid, text, numeric);

-- 3. Replace bulk_adjust_prices with audit-enabled version + negative guard
CREATE OR REPLACE FUNCTION public.bulk_adjust_prices(
    p_distributor_id uuid,
    p_scope_type text,
    p_scope_id uuid,
    p_apply_mode text,
    p_vendor_ids uuid[] DEFAULT NULL,
    p_change_type text DEFAULT 'percent',
    p_value numeric DEFAULT 0,
    p_field text DEFAULT 'sell_price'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base_updated integer := 0;
    v_overrides_upserted integer := 0;
    v_product_ids uuid[];
    v_vendor_target_ids uuid[];
    v_batch_id uuid;
BEGIN
    -- 1. Authorization
    IF p_distributor_id != auth.uid() THEN
        RETURN json_build_object('error', 'Unauthorized: distributor mismatch');
    END IF;

    -- 2. Validate inputs
    IF p_scope_type NOT IN ('category', 'category_node') THEN
        RETURN json_build_object('error', 'Invalid scope_type');
    END IF;
    IF p_apply_mode NOT IN ('base_only', 'base_and_overrides', 'overrides_only') THEN
        RETURN json_build_object('error', 'Invalid apply_mode');
    END IF;
    IF p_change_type NOT IN ('percent', 'fixed', 'set') THEN
        RETURN json_build_object('error', 'Invalid change_type');
    END IF;
    IF p_field NOT IN ('sell_price', 'price_case', 'cost_price') THEN
        RETURN json_build_object('error', 'Invalid field');
    END IF;

    -- 3. Resolve product IDs in scope
    IF p_scope_type = 'category' THEN
        SELECT array_agg(id) INTO v_product_ids
        FROM public.products
        WHERE distributor_id = p_distributor_id
          AND category_id = p_scope_id
          AND deleted_at IS NULL;
    ELSIF p_scope_type = 'category_node' THEN
        WITH RECURSIVE node_tree AS (
            SELECT id FROM public.category_nodes
            WHERE id = p_scope_id AND distributor_id = p_distributor_id
            UNION ALL
            SELECT cn.id FROM public.category_nodes cn
            INNER JOIN node_tree nt ON cn.parent_id = nt.id
        )
        SELECT array_agg(p.id) INTO v_product_ids
        FROM public.products p
        WHERE p.distributor_id = p_distributor_id
          AND p.category_node_id IN (SELECT id FROM node_tree)
          AND p.deleted_at IS NULL;
    END IF;

    IF v_product_ids IS NULL OR array_length(v_product_ids, 1) IS NULL THEN
        RETURN json_build_object('success', true, 'products_affected', 0, 'base_updated', 0, 'overrides_upserted', 0, 'batch_id', NULL);
    END IF;

    -- 4. Create audit batch
    INSERT INTO public.price_change_batches (
        distributor_id, created_by, scope, scope_id,
        adjustment_type, adjustment_value,
        apply_mode, change_type, field, value_applied
    ) VALUES (
        p_distributor_id, auth.uid(), p_scope_type, p_scope_id,
        p_change_type, ROUND(p_value * 100)::integer,
        p_apply_mode, p_change_type, p_field, p_value
    ) RETURNING id INTO v_batch_id;

    -- 5. Apply BASE price updates (when mode includes base)
    IF p_apply_mode IN ('base_only', 'base_and_overrides') THEN

        -- Write per-item audit BEFORE update (capture old price)
        IF p_field = 'sell_price' THEN
            INSERT INTO public.price_change_items (batch_id, product_id, product_name, old_price_cents, new_price_cents)
            SELECT v_batch_id, id, name,
                ROUND(COALESCE(sell_price, 0) * 100)::integer,
                GREATEST(0, ROUND(
                    CASE
                        WHEN p_change_type = 'percent' THEN sell_price * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN sell_price + p_value
                        WHEN p_change_type = 'set'     THEN p_value
                        ELSE sell_price
                    END * 100
                ))::integer
            FROM public.products WHERE id = ANY(v_product_ids);

            UPDATE public.products SET
                sell_price = GREATEST(0, ROUND(
                    CASE
                        WHEN p_change_type = 'percent' THEN sell_price * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN sell_price + p_value
                        WHEN p_change_type = 'set'     THEN ROUND(p_value, 2)
                        ELSE sell_price
                    END, 2))
            WHERE id = ANY(v_product_ids);

        ELSIF p_field = 'price_case' THEN
            INSERT INTO public.price_change_items (batch_id, product_id, product_name, old_price_cents, new_price_cents)
            SELECT v_batch_id, id, name,
                ROUND(COALESCE(price_case, 0) * 100)::integer,
                GREATEST(0, ROUND(
                    CASE
                        WHEN p_change_type = 'percent' THEN COALESCE(price_case, 0) * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN COALESCE(price_case, 0) + p_value
                        WHEN p_change_type = 'set'     THEN p_value
                        ELSE COALESCE(price_case, 0)
                    END * 100
                ))::integer
            FROM public.products WHERE id = ANY(v_product_ids);

            UPDATE public.products SET
                price_case = GREATEST(0, ROUND(
                    CASE
                        WHEN p_change_type = 'percent' THEN COALESCE(price_case, 0) * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN COALESCE(price_case, 0) + p_value
                        WHEN p_change_type = 'set'     THEN ROUND(p_value, 2)
                        ELSE price_case
                    END, 2))
            WHERE id = ANY(v_product_ids);

        ELSIF p_field = 'cost_price' THEN
            INSERT INTO public.price_change_items (batch_id, product_id, product_name, old_price_cents, new_price_cents)
            SELECT v_batch_id, id, name,
                ROUND(COALESCE(cost_price, 0) * 100)::integer,
                GREATEST(0, ROUND(
                    CASE
                        WHEN p_change_type = 'percent' THEN cost_price * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN cost_price + p_value
                        WHEN p_change_type = 'set'     THEN p_value
                        ELSE cost_price
                    END * 100
                ))::integer
            FROM public.products WHERE id = ANY(v_product_ids);

            UPDATE public.products SET
                cost_price = GREATEST(0, ROUND(
                    CASE
                        WHEN p_change_type = 'percent' THEN cost_price * (1.0 + p_value / 100.0)
                        WHEN p_change_type = 'fixed'   THEN cost_price + p_value
                        WHEN p_change_type = 'set'     THEN ROUND(p_value, 2)
                        ELSE cost_price
                    END, 2))
            WHERE id = ANY(v_product_ids);
        END IF;

        GET DIAGNOSTICS v_base_updated = ROW_COUNT;
    END IF;

    -- 6. Apply OVERRIDE updates (when mode includes overrides)
    IF p_apply_mode IN ('base_and_overrides', 'overrides_only') THEN
        IF p_vendor_ids IS NOT NULL AND array_length(p_vendor_ids, 1) > 0 THEN
            v_vendor_target_ids := p_vendor_ids;
        ELSE
            SELECT array_agg(vendor_id) INTO v_vendor_target_ids
            FROM public.distributor_vendors
            WHERE distributor_id = p_distributor_id;
        END IF;

        IF v_vendor_target_ids IS NOT NULL AND array_length(v_vendor_target_ids, 1) > 0 THEN
            INSERT INTO public.vendor_price_overrides (distributor_id, vendor_id, product_id, price_cents, updated_at)
            SELECT
                p_distributor_id,
                v.vendor_id,
                p.id,
                GREATEST(0,
                    CASE
                        WHEN p_apply_mode = 'base_and_overrides' THEN
                            CASE p_field
                                WHEN 'sell_price' THEN ROUND(p.sell_price * 100)::integer
                                WHEN 'price_case' THEN ROUND(COALESCE(p.price_case, 0) * 100)::integer
                                WHEN 'cost_price' THEN ROUND(p.cost_price * 100)::integer
                                ELSE ROUND(p.sell_price * 100)::integer
                            END
                        WHEN p_apply_mode = 'overrides_only' THEN
                            CASE p_field
                                WHEN 'sell_price' THEN
                                    CASE p_change_type
                                        WHEN 'percent' THEN ROUND(p.sell_price * (1.0 + p_value / 100.0) * 100)::integer
                                        WHEN 'fixed'   THEN ROUND((p.sell_price + p_value) * 100)::integer
                                        WHEN 'set'     THEN ROUND(p_value * 100)::integer
                                        ELSE ROUND(p.sell_price * 100)::integer
                                    END
                                WHEN 'price_case' THEN
                                    CASE p_change_type
                                        WHEN 'percent' THEN ROUND(COALESCE(p.price_case, 0) * (1.0 + p_value / 100.0) * 100)::integer
                                        WHEN 'fixed'   THEN ROUND((COALESCE(p.price_case, 0) + p_value) * 100)::integer
                                        WHEN 'set'     THEN ROUND(p_value * 100)::integer
                                        ELSE ROUND(COALESCE(p.price_case, 0) * 100)::integer
                                    END
                                WHEN 'cost_price' THEN
                                    CASE p_change_type
                                        WHEN 'percent' THEN ROUND(p.cost_price * (1.0 + p_value / 100.0) * 100)::integer
                                        WHEN 'fixed'   THEN ROUND((p.cost_price + p_value) * 100)::integer
                                        WHEN 'set'     THEN ROUND(p_value * 100)::integer
                                        ELSE ROUND(p.cost_price * 100)::integer
                                    END
                                ELSE ROUND(p.sell_price * 100)::integer
                            END
                        ELSE ROUND(p.sell_price * 100)::integer
                    END
                ),
                now()
            FROM public.products p
            CROSS JOIN unnest(v_vendor_target_ids) AS v(vendor_id)
            WHERE p.id = ANY(v_product_ids)
            ON CONFLICT (distributor_id, vendor_id, product_id)
            DO UPDATE SET
                price_cents = excluded.price_cents,
                updated_at = now();

            GET DIAGNOSTICS v_overrides_upserted = ROW_COUNT;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'products_affected', COALESCE(array_length(v_product_ids, 1), 0),
        'base_updated', v_base_updated,
        'overrides_upserted', v_overrides_upserted,
        'batch_id', v_batch_id
    );
END;
$$;
