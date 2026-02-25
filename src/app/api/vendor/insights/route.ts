import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { isUuid } from '@/lib/vendor/favorites'

type InsightCategory = {
  category_name: string
  spend: number
  quantity: number
}

type MarginCategory = {
  category_name: string
  revenue: number
  cost: number
  margin: number
  margin_percent: number
}

type InsightWindow = {
  window_days: number
  total_spent: number
  avg_order_value: number
  orders_count: number
  order_frequency_per_week: number
  order_frequency_per_month: number
  top_categories: InsightCategory[]
}

function emptyWindow(windowDays: number): InsightWindow {
  return {
    window_days: windowDays,
    total_spent: 0,
    avg_order_value: 0,
    orders_count: 0,
    order_frequency_per_week: 0,
    order_frequency_per_month: 0,
    top_categories: []
  }
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toWindow(raw: any, windowDays: number): InsightWindow {
  const categories = Array.isArray(raw?.top_categories) ? raw.top_categories : []
  const topCategories: InsightCategory[] = categories
    .map((cat: any) => ({
      category_name: String(cat?.category_name || 'Uncategorized'),
      spend: Math.round(toNumber(cat?.spend) * 100) / 100,
      quantity: Math.round(toNumber(cat?.quantity) * 100) / 100
    }))
    .filter((cat: InsightCategory) => cat.spend > 0 || cat.quantity > 0)
    .slice(0, 5)

  return {
    window_days: windowDays,
    total_spent: Math.round(toNumber(raw?.total_spent) * 100) / 100,
    avg_order_value: Math.round(toNumber(raw?.avg_order_value) * 100) / 100,
    orders_count: Math.max(0, Math.floor(toNumber(raw?.orders_count))),
    order_frequency_per_week: Math.round(toNumber(raw?.order_frequency_per_week) * 10000) / 10000,
    order_frequency_per_month: Math.round(toNumber(raw?.order_frequency_per_month) * 10000) / 10000,
    top_categories: topCategories
  }
}

async function requireVendorUser(supabase: any) {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Unauthorized', status: 401 as const }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id,role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (error) return { error: error.message, status: 400 as const }
  if (!profile || profile.role !== 'vendor') return { error: 'Forbidden', status: 403 as const }
  return { userId: auth.user.id }
}

async function ensureLinkedDistributor(supabase: any, vendorId: string, distributorId: string) {
  const { data: link, error } = await supabase
    .from('distributor_vendors')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('distributor_id', distributorId)
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    return { ok: false as const, error: error.message, status: 400 as const }
  }

  if (!link) {
    return { ok: false as const, error: 'Vendor is not linked to this distributor', status: 403 as const }
  }

  return { ok: true as const }
}

async function fetchWindowViaRpc(
  supabase: any,
  distributorId: string | null,
  windowDays: number
): Promise<InsightWindow | null> {
  const result = await supabase.rpc('get_vendor_purchase_insights', {
    p_distributor_id: distributorId,
    p_window_days: windowDays
  })

  if (result.error) {
    if (result.error.code === 'PGRST202') return null
    const msg = String(result.error.message || '')
    if (msg.includes('get_vendor_purchase_insights')) return null
    throw new Error(result.error.message || 'Failed to load insights')
  }

  const row = Array.isArray(result.data) ? result.data[0] : null
  if (!row) return emptyWindow(windowDays)
  return toWindow(row, windowDays)
}

async function fetchWindowFallback(
  supabase: any,
  vendorId: string,
  distributorId: string | null,
  windowDays: number
): Promise<InsightWindow> {
  const fromIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  let invoicesQuery = supabase
    .from('invoices')
    .select('id,total,created_at,deleted_at')
    .eq('vendor_id', vendorId)
    .gte('created_at', fromIso)
    .order('created_at', { ascending: false })

  if (distributorId) invoicesQuery = invoicesQuery.eq('distributor_id', distributorId)
  let invoicesResult = await invoicesQuery

  if (invoicesResult.error && invoicesResult.error.code === '42703') {
    let fallbackQuery = supabase
      .from('invoices')
      .select('id,total,created_at')
      .eq('vendor_id', vendorId)
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })

    if (distributorId) fallbackQuery = fallbackQuery.eq('distributor_id', distributorId)
    invoicesResult = await fallbackQuery
  }

  if (invoicesResult.error) {
    throw new Error(invoicesResult.error.message || 'Failed to load invoices')
  }

  const invoices = (invoicesResult.data ?? [])
    .filter((row: any) => row.deleted_at == null)
    .map((row: any) => ({
      id: String(row.id || ''),
      total: toNumber(row.total)
    }))
    .filter((row: any) => row.id.length > 0)

  const orderCount = invoices.length
  const totalSpent = invoices.reduce((sum: number, row: any) => sum + row.total, 0)
  const avgOrder = orderCount > 0 ? totalSpent / orderCount : 0
  const perWeek = orderCount / Math.max(windowDays / 7, 1)
  const perMonth = orderCount / Math.max(windowDays / 30, 1)

  let topCategories: InsightCategory[] = []
  if (invoices.length > 0) {
    const invoiceIds = invoices.map((row: any) => row.id)
    const itemsResult = await supabase
      .from('invoice_items')
      .select('invoice_id,category_name_snapshot,category_label,category_name,quantity_snapshot,qty,line_total_snapshot,ext_amount,unit_price,is_manual')
      .in('invoice_id', invoiceIds)

    if (!itemsResult.error) {
      const byCategory = new Map<string, { spend: number; quantity: number }>()
      for (const item of itemsResult.data ?? []) {
        if (item?.is_manual === true) continue
        const categoryName = String(
          item?.category_name_snapshot
          || item?.category_label
          || item?.category_name
          || 'Uncategorized'
        ).trim() || 'Uncategorized'

        const quantity = toNumber(item?.quantity_snapshot ?? item?.qty)
        const spend = toNumber(item?.line_total_snapshot ?? item?.ext_amount ?? (toNumber(item?.qty) * toNumber(item?.unit_price)))
        const current = byCategory.get(categoryName) ?? { spend: 0, quantity: 0 }
        current.spend += spend
        current.quantity += quantity
        byCategory.set(categoryName, current)
      }

      topCategories = Array.from(byCategory.entries())
        .map(([category_name, value]) => ({
          category_name,
          spend: Math.round(value.spend * 100) / 100,
          quantity: Math.round(value.quantity * 100) / 100
        }))
        .sort((a, b) => b.spend - a.spend || a.category_name.localeCompare(b.category_name))
        .slice(0, 5)
    }
  }

  return {
    window_days: windowDays,
    total_spent: Math.round(totalSpent * 100) / 100,
    avg_order_value: Math.round(avgOrder * 100) / 100,
    orders_count: orderCount,
    order_frequency_per_week: Math.round(perWeek * 10000) / 10000,
    order_frequency_per_month: Math.round(perMonth * 10000) / 10000,
    top_categories: topCategories
  }
}

async function fetchMarginSetting(supabase: any, distributorId: string | null): Promise<boolean> {
  if (!distributorId) return false
  const result = await supabase
    .from('distributor_feature_settings')
    .select('vendor_can_view_margin')
    .eq('distributor_id', distributorId)
    .maybeSingle()

  if (result.error) return false
  return !!result.data?.vendor_can_view_margin
}

async function fetchMarginByCategory(
  supabase: any,
  vendorId: string,
  distributorId: string | null,
  windowDays: number
): Promise<MarginCategory[]> {
  const fromIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  let invoiceQuery = supabase
    .from('invoices')
    .select('id,created_at,deleted_at')
    .eq('vendor_id', vendorId)
    .gte('created_at', fromIso)

  if (distributorId) invoiceQuery = invoiceQuery.eq('distributor_id', distributorId)
  let invoicesResult = await invoiceQuery

  if (invoicesResult.error && invoicesResult.error.code === '42703') {
    let fallback = supabase
      .from('invoices')
      .select('id,created_at')
      .eq('vendor_id', vendorId)
      .gte('created_at', fromIso)
    if (distributorId) fallback = fallback.eq('distributor_id', distributorId)
    invoicesResult = await fallback
  }

  if (invoicesResult.error) return []

  const invoiceIds = (invoicesResult.data ?? [])
    .filter((row: any) => row.deleted_at == null)
    .map((row: any) => String(row.id || ''))
    .filter((id: string) => id.length > 0)

  if (invoiceIds.length === 0) return []

  const itemsResult = await supabase
    .from('invoice_items')
    .select('category_name_snapshot,category_label,category_name,quantity_snapshot,qty,line_total_snapshot,ext_amount,unit_price,unit_cost,is_manual')
    .in('invoice_id', invoiceIds)

  if (itemsResult.error) return []

  const byCategory = new Map<string, { revenue: number; cost: number }>()
  for (const item of itemsResult.data ?? []) {
    if (item?.is_manual === true) continue
    const categoryName = String(
      item?.category_name_snapshot
      || item?.category_label
      || item?.category_name
      || 'Uncategorized'
    ).trim() || 'Uncategorized'

    const quantity = toNumber(item?.quantity_snapshot ?? item?.qty)
    const revenue = toNumber(item?.line_total_snapshot ?? item?.ext_amount ?? (toNumber(item?.qty) * toNumber(item?.unit_price)))
    const cost = quantity * toNumber(item?.unit_cost)

    const current = byCategory.get(categoryName) ?? { revenue: 0, cost: 0 }
    current.revenue += revenue
    current.cost += cost
    byCategory.set(categoryName, current)
  }

  return Array.from(byCategory.entries())
    .map(([category_name, value]) => {
      const margin = value.revenue - value.cost
      const marginPercent = value.revenue > 0 ? (margin / value.revenue) * 100 : 0
      return {
        category_name,
        revenue: Math.round(value.revenue * 100) / 100,
        cost: Math.round(value.cost * 100) / 100,
        margin: Math.round(margin * 100) / 100,
        margin_percent: Math.round(marginPercent * 100) / 100
      }
    })
    .sort((a, b) => b.revenue - a.revenue || a.category_name.localeCompare(b.category_name))
    .slice(0, 5)
}

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const distributorParam = String(request.nextUrl.searchParams.get('distributorId') || '').trim()
  const distributorId = distributorParam.length > 0 ? distributorParam : null
  if (distributorId && !isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  if (distributorId) {
    const linkCheck = await ensureLinkedDistributor(supabase, vendor.userId, distributorId)
    if (!linkCheck.ok) return NextResponse.json({ error: linkCheck.error }, { status: linkCheck.status })
  }

  try {
    const windows = [30, 90] as const
    const [canViewMargin, insights] = await Promise.all([
      fetchMarginSetting(supabase, distributorId),
      Promise.all(
        windows.map(async (windowDays) => {
          const rpcWindow = await fetchWindowViaRpc(supabase, distributorId, windowDays)
          if (rpcWindow) return [windowDays, rpcWindow] as const
          const fallback = await fetchWindowFallback(supabase, vendor.userId, distributorId, windowDays)
          return [windowDays, fallback] as const
        })
      )
    ])

    const insightMap = Object.fromEntries(insights) as Record<'30' | '90', InsightWindow>
    const marginByCategory = canViewMargin
      ? Object.fromEntries(
        await Promise.all(
          windows.map(async (windowDays) => {
            const rows = await fetchMarginByCategory(supabase, vendor.userId, distributorId, windowDays)
            return [String(windowDays), rows] as const
          })
        )
      )
      : { '30': [], '90': [] }

    return NextResponse.json({
      ok: true,
      distributor_id: distributorId,
      can_view_margin: canViewMargin,
      insights: {
        '30': insightMap['30'] ?? emptyWindow(30),
        '90': insightMap['90'] ?? emptyWindow(90)
      },
      margin_by_category: {
        '30': Array.isArray((marginByCategory as any)['30']) ? (marginByCategory as any)['30'] : [],
        '90': Array.isArray((marginByCategory as any)['90']) ? (marginByCategory as any)['90'] : []
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load insights' }, { status: 500 })
  }
}
