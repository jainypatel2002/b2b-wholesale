'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import type { PriceUnit } from '@/lib/pricing/types'
import { parseNumericInput, parsePriceUnit } from '@/lib/pricing/priceValidation'
import {
    getPriceUnitForBulkTarget,
    resolveBulkPriceFieldTarget,
    toLegacyBulkPriceField,
    type BulkPriceFieldTarget,
    type LegacyBulkPriceField
} from '@/lib/pricing/bulkPriceTargets'

export async function executeBulkPriceAdjustment(params: {
    distributorId: string
    scope: {
        type: 'category' | 'category_node'
        id: string
    }
    applyMode: 'base_only' | 'base_and_overrides' | 'overrides_only'
    vendorIds: string[] | null
    changeType: 'percent' | 'fixed' | 'set'
    value: number
    fieldTarget?: BulkPriceFieldTarget | LegacyBulkPriceField
    field?: BulkPriceFieldTarget | LegacyBulkPriceField
    priceUnit: PriceUnit
}) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        if (params.distributorId !== distributorId) {
            return { ok: false, error: 'Distributor mismatch' }
        }

        const resolvedFieldTarget = resolveBulkPriceFieldTarget({
            fieldTarget: params.fieldTarget,
            field: params.field
        })
        if (!resolvedFieldTarget.ok) {
            return { ok: false, error: resolvedFieldTarget.error }
        }

        const parsedUnit = parsePriceUnit(params.priceUnit)
        if (!parsedUnit.ok) {
            return { ok: false, error: parsedUnit.error }
        }

        const expectedUnit = getPriceUnitForBulkTarget(resolvedFieldTarget.value)
        if (parsedUnit.value !== expectedUnit) {
            return {
                ok: false,
                error: `Invalid price unit for ${resolvedFieldTarget.value}. Expected ${expectedUnit}.`
            }
        }

        const parsedValue = parseNumericInput(params.value, 'value', {
            allowNegative: params.changeType !== 'set',
            roundTo: 4
        })
        if (!parsedValue.ok) {
            return { ok: false, error: parsedValue.error }
        }

        const { data, error } = await supabase.rpc('bulk_adjust_prices', {
            p_distributor_id: distributorId,
            p_scope_type: params.scope.type,
            p_scope_id: params.scope.id,
            p_apply_mode: params.applyMode,
            p_vendor_ids: params.vendorIds,
            p_change_type: params.changeType,
            p_value: parsedValue.value,
            p_field: toLegacyBulkPriceField(resolvedFieldTarget.value),
            p_price_unit: parsedUnit.value
        })

        if (error) {
            console.error('Bulk price adjustment RPC error:', error)
            if (error.code === 'PGRST202') {
                return { ok: false, error: 'The bulk_adjust_prices function is missing required parameters. Please apply migration 20260313000001_bulk_pricing_cost_targets.sql in Supabase SQL Editor.' }
            }
            return { ok: false, error: error.message }
        }

        if (data?.error) {
            if (resolvedFieldTarget.value === 'COST_CASE' && data.error === 'Invalid field') {
                return { ok: false, error: 'Cost Price (Per Case) requires migration 20260313000001_bulk_pricing_cost_targets.sql. Please apply it in Supabase SQL Editor.' }
            }
            return { ok: false, error: data.error }
        }

        return { ok: true, data }
    } catch (e: any) {
        console.error('Execute bulk price adjustment error:', e)
        return { ok: false, error: e.message }
    } finally {
        // Revalidate all pages that display prices
        revalidatePath('/distributor/inventory')
        revalidatePath('/distributor/bulk-pricing')
        revalidatePath('/distributor/vendor-pricing')
        revalidatePath('/vendor/catalog', 'layout')
        revalidatePath('/vendor/cart', 'layout')
    }
}

export async function fetchScopeProductCount(scopeType: 'category' | 'category_node', scopeId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        let query = supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)

        if (scopeType === 'category') {
            query = query.eq('category_id', scopeId)
        } else {
            // For category_node, we need to count products in this node + descendants
            // Fetch all nodes under this one
            const { data: allNodes } = await supabase
                .from('category_nodes')
                .select('id, parent_id')
                .eq('distributor_id', distributorId)

            const nodeIds = new Set<string>([scopeId])
            let changed = true
            while (changed) {
                changed = false
                for (const n of allNodes || []) {
                    if (n.parent_id && nodeIds.has(n.parent_id) && !nodeIds.has(n.id)) {
                        nodeIds.add(n.id)
                        changed = true
                    }
                }
            }

            query = query.in('category_node_id', Array.from(nodeIds))
        }

        const { count, error } = await query
        if (error) throw error
        return { ok: true, count: count || 0 }
    } catch (e: any) {
        console.error('Fetch scope product count error:', e)
        return { ok: false, count: 0, error: e.message }
    }
}

export async function fetchSampleProducts(scopeType: 'category' | 'category_node', scopeId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        let query = supabase
            .from('products')
            .select('id, name, sku, sell_price, price_case, cost_price, cost_case')
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)
            .order('name', { ascending: true })
            .limit(50)

        if (scopeType === 'category') {
            query = query.eq('category_id', scopeId)
        } else {
            const { data: allNodes } = await supabase
                .from('category_nodes')
                .select('id, parent_id')
                .eq('distributor_id', distributorId)

            const nodeIds = new Set<string>([scopeId])
            let changed = true
            while (changed) {
                changed = false
                for (const n of allNodes || []) {
                    if (n.parent_id && nodeIds.has(n.parent_id) && !nodeIds.has(n.id)) {
                        nodeIds.add(n.id)
                        changed = true
                    }
                }
            }

            query = query.in('category_node_id', Array.from(nodeIds))
        }

        const { data, error } = await query
        if (error) throw error
        return { ok: true, products: data || [] }
    } catch (e: any) {
        return { ok: false, products: [], error: e.message }
    }
}
