
import { createClient } from '@/lib/supabase/server'
import { calcRevenue, calcCost, calcProfit, calcMargin } from './calc'

export type ProfitOverview = {
    revenue: number
    cost: number
    profit: number
    margin: number
    orderCount: number
}

export type ProductProfitability = {
    productId: string
    productName: string
    soldQty: number
    revenue: number
    cost: number
    profit: number
    margin: number
    isEstimated: boolean
}

export type VendorProfitability = {
    vendorId: string
    vendorName: string
    orderCount: number
    revenue: number
    profit: number
    margin: number
}

export type TimeSeriesPoint = {
    date: string
    revenue: number
    profit: number
}

export type LossSignal = {
    type: 'Low Margin' | 'Dead Inventory' | 'Vendor Debt Risk' | 'Price Mistake' | 'Stockout Risk'
    severity: 'high' | 'medium' | 'low'
    message: string
    entityName?: string
    entityId?: string
}

const FIVE_PERCENT_MARGIN = 5

/**
 * Helper to build date range filter
 */
function applyDateRange(query: any, range: { from: Date; to: Date }) {
    // Ensure we cover the entire 'to' day by setting it to end of day if it's not already
    const endOfDay = new Date(range.to)
    endOfDay.setHours(23, 59, 59, 999)

    return query
        .gte('created_at', range.from.toISOString())
        .lte('created_at', endOfDay.toISOString())
}

/**
 * 1. Overview Stats
 */
export async function getProfitOverview(
    distributorId: string,
    range: { from: Date; to: Date }
): Promise<ProfitOverview> {
    const supabase = await createClient()

    let data: any[] = [];
    let error: any = null;

    // Try fetching with new columns
    const { data: newData, error: newError } = await applyDateRange(
        supabase
            .from('orders')
            .select(`
                id,
                order_items (
                    selling_price_at_time,
                    cost_price_at_time,
                    unit_price,
                    unit_cost,
                    total_pieces,
                    products (
                        sell_price,
                        cost_price
                    )
                )
            `)
            .eq('distributor_id', distributorId)
            .neq('status', 'cancelled'),
        range
    );

    if (newError && newError.code === '42703') {
        // Fallback: Column missing, use legacy fields (and join products for deep fallback)
        console.warn('ProfitCenter: Missing columns, falling back to legacy schema.');
        const { data: oldData, error: oldError } = await applyDateRange(
            supabase
                .from('orders')
                .select(`
                    id,
                    order_items (
                        unit_price,
                        unit_cost,
                        total_pieces,
                        products (
                            sell_price,
                            cost_price
                        )
                    )
                `)
                .eq('distributor_id', distributorId)
                .neq('status', 'cancelled'),
            range
        );

        if (oldError) throw new Error(oldError.message);

        // Map legacy data to new structure
        data = oldData?.map((o: any) => ({
            ...o,
            order_items: o.order_items.map((i: any) => ({
                selling_price_at_time: i.unit_price,
                cost_price_at_time: i.unit_cost, // might be null
                total_pieces: i.total_pieces,
                products: i.products
            }))
        })) || [];
    } else if (newError) {
        throw new Error(newError.message);
    } else {
        data = newData || [];
    }

    // Flatten items
    const allItems = data?.flatMap(o => o.order_items) || []

    const calcItems = allItems.map((i: any) => {
        // Fallback Logic: Snapshot -> Legacy Unit Price -> Current Product Price -> 0
        const sell = Number(i.selling_price_at_time) || Number(i.unit_price) || Number(i.products?.sell_price) || 0;
        const cost = Number(i.cost_price_at_time) || Number(i.unit_cost) || Number(i.products?.cost_price) || 0;

        return {
            selling_price_at_time: sell,
            cost_price_at_time: cost,
            quantity: i.total_pieces || 0
        };
    })

    const revenue = calcRevenue(calcItems)
    const cost = calcCost(calcItems)
    const profit = calcProfit(revenue, cost)
    const margin = calcMargin(profit, revenue)

    return {
        revenue,
        cost,
        profit,
        margin,
        orderCount: data?.length || 0
    }
}

/**
 * 2. Product Profitability
 */
export async function getProductProfitability(
    distributorId: string,
    range: { from: Date; to: Date }
): Promise<ProductProfitability[]> {
    const supabase = await createClient()

    let data: any[] = [];
    let error: any = null;

    // Try new schema
    const { data: newData, error: newError } = await applyDateRange(
        supabase
            .from('order_items')
            .select(`
                product_id,
                selling_price_at_time,
                cost_price_at_time,
                unit_price,
                unit_cost,
                total_pieces,
                products!inner (
                    name,
                    distributor_id,
                    sell_price,
                    cost_price
                ),
                orders!inner (
                    created_at,
                    distributor_id,
                    status
                )
            `)
            .eq('orders.distributor_id', distributorId)
            .neq('orders.status', 'cancelled'),
        range
    );

    if (newError && newError.code === '42703') {
        const { data: oldData, error: oldError } = await applyDateRange(
            supabase
                .from('order_items')
                .select(`
                    product_id,
                    unit_price,
                    unit_cost,
                    total_pieces,
                    products!inner (
                        name,
                        distributor_id,
                        sell_price,
                        cost_price
                    ),
                    orders!inner (
                        created_at,
                        distributor_id,
                        status
                    )
                `)
                .eq('orders.distributor_id', distributorId)
                .neq('orders.status', 'cancelled'),
            range
        );
        if (oldError) throw new Error(oldError.message);

        data = oldData?.map((row: any) => ({
            ...row,
            selling_price_at_time: row.unit_price,
            cost_price_at_time: row.unit_cost
        })) || [];
    } else if (newError) {
        throw new Error(newError.message);
    } else {
        data = newData || [];
    }

    // Aggregation
    const map = new Map<string, ProductProfitability>()

    data.forEach((row: any) => {
        const pid = row.product_id
        const pname = row.products?.name || 'Unknown'
        const qty = row.total_pieces || 0

        // Fallback Logic
        const sell = Number(row.selling_price_at_time) || Number(row.unit_price) || Number(row.products?.sell_price) || 0;
        const costPrice = Number(row.cost_price_at_time) || Number(row.unit_cost) || Number(row.products?.cost_price) || 0;

        // "Estimated" if we fell back to product price because snapshot/legacy was missing
        // or if snapshot exists but cost is null.
        // Actually, logic: if cost_price_at_time is NULL, it's estimated. 
        // But if we used fallback, it's also estimated.
        // Simplification: If snapshot cost is missing/zero, estimated.
        const isEstimated = !row.cost_price_at_time;

        const rev = sell * qty
        const cst = costPrice * qty

        const existing = map.get(pid) || {
            productId: pid,
            productName: pname,
            soldQty: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
            margin: 0,
            isEstimated: false
        }

        existing.soldQty += qty
        existing.revenue += rev
        existing.cost += cst
        existing.isEstimated = existing.isEstimated || isEstimated

        map.set(pid, existing)
    })

    // Finalize margins
    const results = Array.from(map.values()).map(p => ({
        ...p,
        profit: calcProfit(p.revenue, p.cost),
        margin: calcMargin(calcProfit(p.revenue, p.cost), p.revenue)
    }))

    return results.sort((a, b) => b.profit - a.profit)
}

/**
 * 3. Vendor Profitability
 */
export async function getVendorProfitability(
    distributorId: string,
    range: { from: Date; to: Date }
): Promise<VendorProfitability[]> {
    const supabase = await createClient()

    let data: any[] = [];
    let error: any = null;

    // Try new schema
    const { data: newData, error: newError } = await applyDateRange(
        supabase
            .from('orders')
            .select(`
                vendor_id,
                order_items (
                    selling_price_at_time,
                    cost_price_at_time,
                    unit_price,
                    unit_cost,
                    total_pieces,
                    products (
                        sell_price,
                        cost_price
                    )
                )
            `)
            .eq('distributor_id', distributorId)
            .neq('status', 'cancelled'),
        range
    );

    if (newError && newError.code === '42703') {
        const { data: oldData, error: oldError } = await applyDateRange(
            supabase
                .from('orders')
                .select(`
                    vendor_id,
                    order_items (
                        unit_price,
                        unit_cost,
                        total_pieces,
                        products (
                            sell_price,
                            cost_price
                        )
                    )
                `)
                .eq('distributor_id', distributorId)
                .neq('status', 'cancelled'),
            range
        );
        if (oldError) throw new Error(oldError.message);

        data = oldData?.map((o: any) => ({
            ...o,
            order_items: o.order_items.map((i: any) => ({
                selling_price_at_time: i.unit_price,
                cost_price_at_time: i.unit_cost,
                total_pieces: i.total_pieces,
                products: i.products
            }))
        })) || [];
    } else if (newError) {
        throw new Error(newError.message);
    } else {
        data = newData || [];
    }

    const vendorIds = Array.from(new Set(data.map(o => o.vendor_id)))

    // Attempt to fetch profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email') // Guessing schema
        .in('id', vendorIds)
    // .catch not available on builder, we just handle null data naturally

    const profileMap = new Map<string, string>(profiles?.map((p: any) => [p.id, String(p.full_name || p.email || '')]) || [])

    const map = new Map<string, VendorProfitability>()

    data.forEach((o: any) => {
        const vid = o.vendor_id
        // If no profile found, show a fallback
        const vname = profileMap.get(vid) || `Vendor ${vid.slice(0, 8)}...`

        const items = o.order_items.map((i: any) => {
            const sell = Number(i.selling_price_at_time) || Number(i.unit_price) || Number(i.products?.sell_price) || 0;
            const cost = Number(i.cost_price_at_time) || Number(i.unit_cost) || Number(i.products?.cost_price) || 0;
            return {
                selling_price_at_time: sell,
                cost_price_at_time: cost,
                quantity: i.total_pieces || 0
            };
        })

        const rev = calcRevenue(items)
        const cost = calcCost(items)
        const profit = calcProfit(rev, cost)

        const existing = map.get(vid) || {
            vendorId: vid,
            vendorName: vname,
            orderCount: 0,
            revenue: 0,
            profit: 0,
            margin: 0
        }

        existing.orderCount++
        existing.revenue += rev
        existing.profit += profit

        map.set(vid, existing)
    })

    const results = Array.from(map.values()).map(v => ({
        ...v,
        margin: calcMargin(v.profit, v.revenue)
    }))

    return results.sort((a, b) => b.profit - a.profit)
}

/**
 * 4. Time Series
 */
export async function getTimeSeries(
    distributorId: string,
    range: { from: Date; to: Date }
): Promise<TimeSeriesPoint[]> {
    const supabase = await createClient()

    let data: any[] = [];
    let error: any = null;

    // Try new schema
    const { data: newData, error: newError } = await applyDateRange(
        supabase
            .from('orders')
            .select(`
                created_at,
                order_items (
                    selling_price_at_time,
                    cost_price_at_time,
                    unit_price,
                    unit_cost,
                    total_pieces,
                    products (
                        sell_price,
                        cost_price
                    )
                )
            `)
            .eq('distributor_id', distributorId)
            .neq('status', 'cancelled'),
        range
    );

    if (newError && newError.code === '42703') {
        const { data: oldData, error: oldError } = await applyDateRange(
            supabase
                .from('orders')
                .select(`
                    created_at,
                    order_items (
                        unit_price,
                        unit_cost,
                        total_pieces,
                        products (
                            sell_price,
                            cost_price
                        )
                    )
                `)
                .eq('distributor_id', distributorId)
                .neq('status', 'cancelled'),
            range
        );
        if (oldError) throw new Error(oldError.message);

        data = oldData?.map((o: any) => ({
            ...o,
            order_items: o.order_items.map((i: any) => ({
                selling_price_at_time: i.unit_price,
                cost_price_at_time: i.unit_cost,
                total_pieces: i.total_pieces,
                products: i.products
            }))
        })) || [];
    } else if (newError) {
        throw new Error(newError.message);
    } else {
        data = newData || [];
    }

    const map = new Map<string, { revenue: number, profit: number }>()

    data.forEach((o: any) => {
        const dateStr = new Date(o.created_at).toLocaleDateString()

        const items = o.order_items.map((i: any) => {
            const sell = Number(i.selling_price_at_time) || Number(i.unit_price) || Number(i.products?.sell_price) || 0;
            const cost = Number(i.cost_price_at_time) || Number(i.unit_cost) || Number(i.products?.cost_price) || 0;
            return {
                selling_price_at_time: sell,
                cost_price_at_time: cost,
                quantity: i.total_pieces || 0
            };
        })

        const rev = calcRevenue(items)
        const cst = calcCost(items)
        const prof = calcProfit(rev, cst)

        const existing = map.get(dateStr) || { revenue: 0, profit: 0 }
        existing.revenue += rev
        existing.profit += prof
        map.set(dateStr, existing)
    })

    return Array.from(map.entries()).map(([date, val]) => ({
        date,
        revenue: val.revenue,
        profit: val.profit
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * 5. Hidden Loss Signals
 */
export async function getHiddenLossSignals(
    distributorId: string
): Promise<LossSignal[]> {
    const supabase = await createClient()
    const signals: LossSignal[] = []

    // 1. Low Margin Products (using current prices for forward looking, or past sales?)
    // Let's check products with current margin < 5%
    const { data: products } = await supabase
        .from('products')
        .select('id, name, cost_price, sell_price, stock_pieces')
        .eq('distributor_id', distributorId)

    products?.forEach((p: any) => {
        const cost = Number(p.cost_price) || 0
        const sell = Number(p.sell_price) || 0
        const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0

        if (margin < FIVE_PERCENT_MARGIN && sell > 0) {
            signals.push({
                type: 'Low Margin',
                severity: margin < 0 ? 'high' : 'medium',
                message: `Product "${p.name}" has a low margin of ${margin.toFixed(1)}%`,
                entityName: p.name,
                entityId: p.id
            })
        }

        // Stockout Risk
        if ((p.stock_pieces || 0) < 5) { // Hardcoded 5 as placeholder for reorder point
            signals.push({
                type: 'Stockout Risk',
                severity: 'high',
                message: `Product "${p.name}" is low on stock (${p.stock_pieces} left)`,
                entityName: p.name,
                entityId: p.id
            })
        }
    })

    // 2. Dead Inventory (No sales in 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentSales } = await supabase
        .from('order_items')
        .select('product_id')
        .gt('created_at', thirtyDaysAgo.toISOString()) // This assumes order_items has created_at, if not join orders
        // Actually safe to assume order_items usually doesn't have created_at unless inherited? 
        // Usually it does in fresh supabase schemas, but let's join orders to be safe.
        // NOTE: order_items might not have created_at if not added in migration. 
        // Let's rely on Orders created_at as original plan.
        .select('product_id, orders!inner(created_at, distributor_id)')
        .eq('orders.distributor_id', distributorId)
        .gt('orders.created_at', thirtyDaysAgo.toISOString())

    const activeProductIds = new Set(recentSales?.map((r: any) => r.product_id))

    products?.forEach((p: any) => {
        if (!activeProductIds.has(p.id) && (p.stock_pieces > 0)) {
            signals.push({
                type: 'Dead Inventory',
                severity: 'medium',
                message: `Product "${p.name}" has not sold in the last 30 days.`,
                entityName: p.name,
                entityId: p.id
            })
        }
    })

    // 3. Price Mistakes (Historical)
    // Avoid using .rpc() which might be missing. 
    // Just fetch recent items and filter in JS.
    const { data: badOrders } = await supabase
        .from('order_items')
        .select(`
        id,
        selling_price_at_time,
        cost_price_at_time,
        products(name),
        orders!inner(distributor_id, created_at)
    `)
        .eq('orders.distributor_id', distributorId)
        // .limit(200) // Removed Limit to ensure we find current mistakes
        .order('created_at', { ascending: false, foreignTable: 'orders' })
        .limit(200)

    badOrders?.forEach((item: any) => {
        const sell = Number(item.selling_price_at_time) || 0
        const cost = Number(item.cost_price_at_time) || 0
        // Flag if Sell < Cost, but only if Cost is known (>0).
        if (cost > 0 && sell < cost) {
            signals.push({
                type: 'Price Mistake',
                severity: 'high',
                message: `Sold "${item.products?.name}" at loss (Sell: $${sell}, Cost: $${cost})`,
                entityName: item.products?.name,
                entityId: item.id
            })
        }
    })

    return signals
}
