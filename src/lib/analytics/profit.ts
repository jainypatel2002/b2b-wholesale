import { createClient } from '@/lib/supabase/server'
import { calcMargin } from './calc'
import { fetchDistributorTransactionLines } from './transactions'
import { getEffectiveAnalyticsRange, getLatestProfitResetWithClient, type AnalyticsRange } from './profitReset'

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
  soldCases: number
  soldUnits: number
  soldUnitsEquivalent: number | null
  hasUnknownUnitConversion: boolean
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

type ProfitQueryOptions = {
  resetAt?: Date | null
}

function toTransactionKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`
}

async function resolveResetAt(
  supabase: any,
  distributorId: string,
  options?: ProfitQueryOptions
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
 * 1. Overview Stats
 */
export async function getProfitOverview(
  distributorId: string,
  range: AnalyticsRange,
  options?: ProfitQueryOptions
): Promise<ProfitOverview> {
  const supabase = await createClient()
  const resetAt = await resolveResetAt(supabase, distributorId, options)
  const effectiveRange = getEffectiveAnalyticsRange(range, resetAt)

  if (!effectiveRange.hasData) {
    return {
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      orderCount: 0
    }
  }

  const lines = await fetchDistributorTransactionLines(supabase, distributorId, effectiveRange)

  const revenue = lines.reduce((sum, line) => sum + line.revenue, 0)
  const cost = lines.reduce((sum, line) => sum + line.cost, 0)
  const profit = revenue - cost
  const margin = calcMargin(profit, revenue)
  const orderCount = new Set(lines.map((line) => toTransactionKey(line.sourceType, line.sourceId))).size

  return {
    revenue,
    cost,
    profit,
    margin,
    orderCount
  }
}

/**
 * 2. Product Profitability
 */
export async function getProductProfitability(
  distributorId: string,
  range: AnalyticsRange,
  options?: ProfitQueryOptions
): Promise<ProductProfitability[]> {
  const supabase = await createClient()
  const resetAt = await resolveResetAt(supabase, distributorId, options)
  const effectiveRange = getEffectiveAnalyticsRange(range, resetAt)

  if (!effectiveRange.hasData) return []

  const lines = await fetchDistributorTransactionLines(supabase, distributorId, effectiveRange)
  const map = new Map<string, ProductProfitability>()

  for (const line of lines) {
    if (!line.productId) continue

    const existing = map.get(line.productId) || {
      productId: line.productId,
      productName: line.productName,
      soldQty: 0,
      soldCases: 0,
      soldUnits: 0,
      soldUnitsEquivalent: 0,
      hasUnknownUnitConversion: false,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      isEstimated: false
    }

    if (line.soldUnit === 'case') {
      existing.soldCases += line.soldQty
    } else {
      existing.soldUnits += line.soldQty
    }

    if (line.soldUnits !== null) {
      existing.soldUnitsEquivalent = (existing.soldUnitsEquivalent || 0) + line.soldUnits
    } else {
      existing.hasUnknownUnitConversion = true
    }

    existing.revenue += line.revenue
    existing.cost += line.cost
    existing.isEstimated = existing.isEstimated || line.isEstimatedCost

    map.set(line.productId, existing)
  }

  return Array.from(map.values())
    .map((row) => {
      const profit = row.revenue - row.cost
      const soldUnitsEquivalent = row.hasUnknownUnitConversion
        ? (row.soldUnitsEquivalent && row.soldUnitsEquivalent > 0 ? row.soldUnitsEquivalent : null)
        : (row.soldUnitsEquivalent || 0)

      return {
        ...row,
        soldQty: soldUnitsEquivalent ?? (row.soldCases + row.soldUnits),
        soldUnitsEquivalent,
        profit,
        margin: calcMargin(profit, row.revenue)
      }
    })
    .sort((a, b) => b.profit - a.profit)
}

/**
 * 3. Vendor Profitability
 */
export async function getVendorProfitability(
  distributorId: string,
  range: AnalyticsRange,
  options?: ProfitQueryOptions
): Promise<VendorProfitability[]> {
  const supabase = await createClient()
  const resetAt = await resolveResetAt(supabase, distributorId, options)
  const effectiveRange = getEffectiveAnalyticsRange(range, resetAt)

  if (!effectiveRange.hasData) return []

  const lines = await fetchDistributorTransactionLines(supabase, distributorId, effectiveRange)
  const vendorIds = Array.from(new Set(lines.map((line) => line.vendorId).filter((id): id is string => Boolean(id))))

  let profileRows: any[] = []
  if (vendorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', vendorIds)

    if (profilesError && profilesError.code === '42703') {
      const { data: legacyProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', vendorIds)
      profileRows = legacyProfiles || []
    } else if (profilesError) {
      throw new Error(profilesError.message)
    } else {
      profileRows = profiles || []
    }
  }

  const profileMap = new Map<string, string>(
    profileRows.map((profile: any) => [
      String(profile.id),
      String(profile.display_name || profile.full_name || profile.email || '')
    ])
  )

  const map = new Map<string, VendorProfitability>()
  const orderCountByVendor = new Map<string, Set<string>>()

  for (const line of lines) {
    const vendorId = line.vendorId || 'unknown'
    const existing = map.get(vendorId) || {
      vendorId,
      vendorName: vendorId === 'unknown'
        ? 'Unknown Vendor'
        : (profileMap.get(vendorId) || `Vendor ${vendorId.slice(0, 8)}...`),
      orderCount: 0,
      revenue: 0,
      profit: 0,
      margin: 0
    }

    existing.revenue += line.revenue
    existing.profit += line.profit

    if (!orderCountByVendor.has(vendorId)) {
      orderCountByVendor.set(vendorId, new Set<string>())
    }
    orderCountByVendor.get(vendorId)!.add(toTransactionKey(line.sourceType, line.sourceId))

    map.set(vendorId, existing)
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      orderCount: orderCountByVendor.get(row.vendorId)?.size || 0,
      margin: calcMargin(row.profit, row.revenue)
    }))
    .sort((a, b) => b.profit - a.profit)
}

/**
 * 4. Time Series
 */
export async function getTimeSeries(
  distributorId: string,
  range: AnalyticsRange,
  options?: ProfitQueryOptions
): Promise<TimeSeriesPoint[]> {
  const supabase = await createClient()
  const resetAt = await resolveResetAt(supabase, distributorId, options)
  const effectiveRange = getEffectiveAnalyticsRange(range, resetAt)

  if (!effectiveRange.hasData) return []

  const lines = await fetchDistributorTransactionLines(supabase, distributorId, effectiveRange)
  const map = new Map<string, { label: string; revenue: number; profit: number }>()

  for (const line of lines) {
    const date = new Date(line.sourceDate)
    const dateKey = Number.isNaN(date.getTime()) ? line.sourceDate : date.toISOString().slice(0, 10)
    const dateLabel = Number.isNaN(date.getTime()) ? line.sourceDate : date.toLocaleDateString()

    const existing = map.get(dateKey) || { label: dateLabel, revenue: 0, profit: 0 }
    existing.revenue += line.revenue
    existing.profit += line.profit
    map.set(dateKey, existing)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => ({
      date: value.label,
      revenue: value.revenue,
      profit: value.profit
    }))
}

/**
 * 5. Hidden Loss Signals
 */
export async function getHiddenLossSignals(
  distributorId: string,
  options?: ProfitQueryOptions
): Promise<LossSignal[]> {
  const supabase = await createClient()
  const resetAt = await resolveResetAt(supabase, distributorId, options)
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
    if ((p.stock_pieces || 0) < 5) {
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

  const recentSalesFrom = resetAt && resetAt.getTime() > thirtyDaysAgo.getTime()
    ? resetAt
    : thirtyDaysAgo

  const { data: recentSales } = await supabase
    .from('order_items')
    .select('product_id, orders!inner(created_at, distributor_id)')
    .eq('orders.distributor_id', distributorId)
    .gt('orders.created_at', recentSalesFrom.toISOString())

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
    .order('created_at', { ascending: false, foreignTable: 'orders' })
    .limit(200)

  const scopedBadOrders = resetAt
    ? badOrders?.filter((item: any) => new Date(item.orders?.created_at).getTime() >= resetAt.getTime())
    : badOrders

  scopedBadOrders?.forEach((item: any) => {
    const sell = Number(item.selling_price_at_time) || 0
    const cost = Number(item.cost_price_at_time) || 0
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
