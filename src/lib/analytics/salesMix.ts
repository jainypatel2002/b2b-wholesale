import { createClient } from '@/lib/supabase/server'
import { fetchDistributorTransactionLines } from './transactions'
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

  const lines = await fetchDistributorTransactionLines(supabase, distributorId, effectiveRange)

  const map = new Map<string, CategorySalesMix>()
  let totalRevenue = 0

  for (const line of lines) {
    const categoryId = line.categoryId || 'uncategorized'
    const categoryName = line.categoryName || 'Uncategorized'
    const quantity = line.soldUnits ?? line.soldQty

    totalRevenue += line.revenue

    const existing = map.get(categoryId) || {
      categoryId: categoryId === 'uncategorized' ? null : categoryId,
      categoryName,
      revenue: 0,
      quantity: 0,
      percentage: 0
    }

    existing.revenue += line.revenue
    existing.quantity += quantity
    map.set(categoryId, existing)
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      percentage: totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

/**
 * 2. Get Item Sales Mix
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

  const lines = await fetchDistributorTransactionLines(supabase, distributorId, effectiveRange)
  const map = new Map<string, ItemSalesMix & { categoryId: string | null }>()

  for (const line of lines) {
    if (!line.productId) continue

    const quantity = line.soldUnits ?? line.soldQty
    const existing = map.get(line.productId) || {
      productId: line.productId,
      productName: line.productName,
      categoryId: line.categoryId,
      revenue: 0,
      quantity: 0,
      percentage: 0
    }

    existing.revenue += line.revenue
    existing.quantity += quantity
    map.set(line.productId, existing)
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
}
