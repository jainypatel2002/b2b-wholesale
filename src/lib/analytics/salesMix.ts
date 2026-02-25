
import { createClient } from '@/lib/supabase/server'
import { getEffectiveAnalyticsRange, getLatestProfitResetWithClient, type AnalyticsRange } from './profitReset'

export type CategorySalesMix = {
    categoryId: string | null
    categoryName: string
    revenue: number
    quantity: number
    percentage: number
}

export type ItemSalesMix = {
    productId: string
    productName: string
    revenue: number
    quantity: number
    percentage: number
}

type SalesMixQueryOptions = {
    resetAt?: Date | null
}

/**
 * Helper to build date range filter
 */
function applyDateRange(query: any, range: AnalyticsRange, createdAtField = 'created_at') {
    return query
        .gte(createdAtField, range.from.toISOString())
        .lte(createdAtField, range.to.toISOString())
}

async function resolveResetAt(
    supabase: any,
    distributorId: string,
    options?: SalesMixQueryOptions
): Promise<Date | null> {
    if (options && Object.prototype.hasOwnProperty.call(options, 'resetAt')) {
        return options.resetAt ?? null
    }

    const checkpoint = await getLatestProfitResetWithClient(supabase, distributorId)
    if (!checkpoint?.reset_at) return null

    const resetAt = new Date(checkpoint.reset_at)
    return Number.isNaN(resetAt.getTime()) ? null : resetAt
}

/**
 * 1. Get Sales Mix by Category
 */
export async function getCategorySalesMix(
    distributorId: string,
    range: AnalyticsRange,
    options?: SalesMixQueryOptions
): Promise<CategorySalesMix[]> {
    const supabase = await createClient()
    const resetAt = await resolveResetAt(supabase, distributorId, options)
    const effectiveRange = getEffectiveAnalyticsRange(range, resetAt)

    if (!effectiveRange.hasData) return []

    // Fetch order items with product and category details
    // using the robust fallback logic for prices
    let data: any[] = []

    // Try new schema
    const { data: newData, error: newError } = await applyDateRange(
        supabase
            .from('order_items')
            .select(`
                selling_price_at_time,
                cost_price_at_time,
                unit_price,
                total_pieces,
                products!inner (
                    id,
                    sell_price,
                    categories (
                        id,
                        name
                    )
                ),
                orders!inner (
                    distributor_id,
                    created_at,
                    status
                )
            `)
            .eq('orders.distributor_id', distributorId)
            .neq('orders.status', 'cancelled'),
        effectiveRange,
        'orders.created_at'
    )

    if (newError && newError.code === '42703') {
        const { data: oldData, error: oldError } = await applyDateRange(
            supabase
                .from('order_items')
                .select(`
                    unit_price,
                    total_pieces,
                    products!inner (
                        id,
                        sell_price,
                        categories (
                            id,
                            name
                        )
                    ),
                    orders!inner (
                        distributor_id,
                        created_at,
                        status
                    )
                `)
                .eq('orders.distributor_id', distributorId)
                .neq('orders.status', 'cancelled'),
            effectiveRange,
            'orders.created_at'
        )
        if (oldError) throw new Error(oldError.message)

        data = oldData?.map((row: any) => ({
            ...row,
            selling_price_at_time: row.unit_price
        })) || []
    } else if (newError) {
        throw new Error(newError.message)
    } else {
        data = newData || []
    }

    // Aggregate
    const map = new Map<string, CategorySalesMix>()
    let totalRevenue = 0

    data.forEach((row: any) => {
        const cat = row.products?.categories
        const catId = cat?.id || 'uncategorized'
        const catName = cat?.name || 'Uncategorized'

        const qty = row.total_pieces || 0
        const sell = Number(row.selling_price_at_time) || Number(row.unit_price) || Number(row.products?.sell_price) || 0
        const revenue = sell * qty

        totalRevenue += revenue

        const existing = map.get(catId) || {
            categoryId: catId === 'uncategorized' ? null : catId,
            categoryName: catName,
            revenue: 0,
            quantity: 0,
            percentage: 0
        }

        existing.revenue += revenue
        existing.quantity += qty
        map.set(catId, existing)
    })

    // Calculate percentages
    const results = Array.from(map.values()).map(c => ({
        ...c,
        percentage: totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0
    }))

    return results.sort((a, b) => b.revenue - a.revenue)
}

/**
 * 2. Get Item Sales Mix (for all categories or specific one if filtered client-side)
 * We fetch ALL items and let UI filter, OR we can just fetch all and return grouped list.
 * Requirement: "Item Sales Share within a selected category"
 * Strategy: Fetch all items, return flat list with categoryId attached. 
 * Actually, to save bandwidth, let's just fetch all items aggregated by Product.
 * The UI can filter by category since we have the category ID in the data.
 */
export async function getItemSalesMix(
    distributorId: string,
    range: AnalyticsRange,
    options?: SalesMixQueryOptions
): Promise<(ItemSalesMix & { categoryId: string | null })[]> {
    const supabase = await createClient()
    const resetAt = await resolveResetAt(supabase, distributorId, options)
    const effectiveRange = getEffectiveAnalyticsRange(range, resetAt)

    if (!effectiveRange.hasData) return []

    // Try new schema
    let data: any[] = []
    const { data: newData, error: newError } = await applyDateRange(
        supabase
            .from('order_items')
            .select(`
                selling_price_at_time,
                cost_price_at_time,
                unit_price,
                total_pieces,
                products!inner (
                    id,
                    name,
                    sell_price,
                    categories (
                        id,
                        name
                    )
                ),
                orders!inner (
                    distributor_id,
                    created_at,
                    status
                )
            `)
            .eq('orders.distributor_id', distributorId)
            .neq('orders.status', 'cancelled'),
        effectiveRange,
        'orders.created_at'
    )

    if (newError && newError.code === '42703') {
        const { data: oldData, error: oldError } = await applyDateRange(
            supabase
                .from('order_items')
                .select(`
                    unit_price,
                    total_pieces,
                    products!inner (
                        id,
                        name,
                        sell_price,
                        categories (
                            id,
                            name
                        )
                    ),
                    orders!inner (
                        distributor_id,
                        created_at,
                        status
                    )
                `)
                .eq('orders.distributor_id', distributorId)
                .neq('orders.status', 'cancelled'),
            effectiveRange,
            'orders.created_at'
        )
        if (oldError) throw new Error(oldError.message)

        data = oldData?.map((row: any) => ({
            ...row,
            selling_price_at_time: row.unit_price
        })) || []
    } else if (newError) {
        throw new Error(newError.message)
    } else {
        data = newData || []
    }

    // Aggregate by Product
    const map = new Map<string, ItemSalesMix & { categoryId: string | null }>()

    // We need total revenue per category to calc share WITHIN category? 
    // Requirement: "Item Sales Share within a selected category"
    // So if I select "Vapes", I want to see (Product A Rev / Total Vapes Rev).
    // The UI will handle the denominator based on the filtered view.
    // We just provide raw revenue per product + category link.

    data.forEach((row: any) => {
        const prod = row.products
        const pid = prod.id
        const pname = prod.name
        const catId = prod.categories?.id || null

        const qty = row.total_pieces || 0
        const sell = Number(row.selling_price_at_time) || Number(row.unit_price) || Number(prod.sell_price) || 0
        const revenue = sell * qty

        const existing = map.get(pid) || {
            productId: pid,
            productName: pname,
            categoryId: catId,
            revenue: 0,
            quantity: 0,
            percentage: 0 // Will be calculated by UI relative to selection
        }

        existing.revenue += revenue
        existing.quantity += qty
        map.set(pid, existing)
    })

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
}
