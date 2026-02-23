'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

export async function executeBulkPriceAdjustment(params: {
    scopeType: 'category' | 'category_node'
    scopeId: string
    applyMode: 'base_only' | 'base_and_overrides' | 'overrides_only'
    vendorIds: string[] | null
    changeType: 'percent' | 'fixed' | 'set'
    value: number
    field: 'sell_price' | 'price_case' | 'cost_price'
}) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        if (!Number.isFinite(params.value)) {
            return { ok: false, error: 'Invalid value' }
        }

        const { data, error } = await supabase.rpc('bulk_adjust_prices', {
            p_distributor_id: distributorId,
            p_scope_type: params.scopeType,
            p_scope_id: params.scopeId,
            p_apply_mode: params.applyMode,
            p_vendor_ids: params.vendorIds,
            p_change_type: params.changeType,
            p_value: params.value,
            p_field: params.field
        })

        if (error) {
            console.error('Bulk price adjustment RPC error:', error)
            if (error.code === 'PGRST202') {
                return { ok: false, error: 'The bulk_adjust_prices function is not yet available. Please apply the migration 20260226150000_bulk_pricing.sql in Supabase SQL Editor.' }
            }
            return { ok: false, error: error.message }
        }

        if (data?.error) {
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
            .select('id, name, sku, sell_price, price_case, cost_price')
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
