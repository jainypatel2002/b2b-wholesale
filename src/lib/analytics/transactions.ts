import { normalizeInvoiceItem } from '@/lib/pricing-engine'
import type { AnalyticsRange } from './profitReset'

export type TransactionSource = 'invoice' | 'order'
export type SoldUnit = 'case' | 'unit'

export type TransactionLineSourceMeta = {
  sourceType: TransactionSource
  sourceId: string
  sourceDate: string
  vendorId: string | null
  orderId: string | null
}

export type NormalizedTransactionLine = TransactionLineSourceMeta & {
  productId: string | null
  productName: string
  categoryId: string | null
  categoryName: string
  isManual: boolean
  soldUnit: SoldUnit
  soldQty: number
  soldCases: number
  soldUnits: number | null
  unitsPerCase: number | null
  revenue: number
  cost: number
  profit: number
  isEstimatedCost: boolean
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asFiniteNumber(value)
    if (parsed !== null) return parsed
  }
  return null
}

function applyDateRange(query: any, range: AnalyticsRange, createdAtField = 'created_at') {
  return query
    .gte(createdAtField, range.from.toISOString())
    .lte(createdAtField, range.to.toISOString())
}

function toCategoryName(row: any): string {
  const product = Array.isArray(row?.products) ? row.products[0] : row?.products
  return (
    asString(row?.category_name_snapshot)
    || asString(row?.category_label)
    || asString(row?.category_name)
    || asString(product?.categories?.name)
    || 'Uncategorized'
  )
}

function toCategoryId(row: any): string | null {
  const product = Array.isArray(row?.products) ? row.products[0] : row?.products
  const raw = row?.category_id ?? product?.categories?.id
  return raw ? String(raw) : null
}

function toProductName(row: any, normalizedName: string): string {
  const product = Array.isArray(row?.products) ? row.products[0] : row?.products
  return normalizedName || asString(product?.name) || 'Unknown Item'
}

export function normalizeTransactionLine(row: any, source: TransactionLineSourceMeta): NormalizedTransactionLine {
  const normalized = normalizeInvoiceItem(row)
  const soldUnit: SoldUnit = normalized.mode === 'case' ? 'case' : 'unit'
  const soldQty = Math.max(0, Number(normalized.qty || 0))

  const explicitUnitsPerCase = pickNumber(row?.units_per_case_snapshot, row?.units_per_case)
  const normalizedUnitsPerCase = asFiniteNumber(normalized.unitsPerCase)
  const unitsPerCaseRaw = explicitUnitsPerCase ?? normalizedUnitsPerCase
  const unitsPerCase = unitsPerCaseRaw && unitsPerCaseRaw > 0 ? unitsPerCaseRaw : null

  const fallbackSoldUnits = pickNumber(row?.total_pieces)
  const soldCases = soldUnit === 'case'
    ? soldQty
    : (unitsPerCase ? soldQty / unitsPerCase : 0)
  const soldUnits = soldUnit === 'case'
    ? (unitsPerCase ? soldQty * unitsPerCase : fallbackSoldUnits)
    : soldQty

  const revenue = asFiniteNumber(normalized.lineTotal) ?? 0

  const unitCostSnapshot = pickNumber(row?.cost_price_at_time, row?.unit_cost)
  const unitCostCatalog = pickNumber(
    row?.products?.cost_per_unit,
    row?.products?.cost_price,
    Array.isArray(row?.products) ? row.products[0]?.cost_per_unit : null,
    Array.isArray(row?.products) ? row.products[0]?.cost_price : null
  )
  const effectiveUnitCost = unitCostSnapshot ?? unitCostCatalog

  const caseCostFromSnapshot =
    unitCostSnapshot !== null && unitsPerCase ? unitCostSnapshot * unitsPerCase : null
  const caseCostFromCatalog = pickNumber(
    row?.products?.cost_per_case,
    row?.products?.cost_case,
    Array.isArray(row?.products) ? row.products[0]?.cost_per_case : null,
    Array.isArray(row?.products) ? row.products[0]?.cost_case : null
  )
  const caseCostFromUnitCatalog =
    unitCostCatalog !== null && unitsPerCase ? unitCostCatalog * unitsPerCase : null
  const effectiveCaseCost = caseCostFromSnapshot ?? caseCostFromCatalog ?? caseCostFromUnitCatalog

  let cost = 0
  if (soldUnit === 'case') {
    if (effectiveCaseCost !== null) {
      cost = soldQty * effectiveCaseCost
    } else if (effectiveUnitCost !== null && soldUnits !== null) {
      cost = soldUnits * effectiveUnitCost
    }
  } else {
    if (effectiveUnitCost !== null) {
      cost = soldQty * effectiveUnitCost
    } else if (effectiveCaseCost !== null && unitsPerCase) {
      cost = soldQty * (effectiveCaseCost / unitsPerCase)
    }
  }

  return {
    ...source,
    productId: row?.product_id ? String(row.product_id) : null,
    productName: toProductName(row, normalized.productName),
    categoryId: toCategoryId(row),
    categoryName: toCategoryName(row),
    isManual: Boolean(row?.is_manual),
    soldUnit,
    soldQty,
    soldCases,
    soldUnits,
    unitsPerCase,
    revenue,
    cost,
    profit: revenue - cost,
    isEstimatedCost: unitCostSnapshot === null
  }
}

async function fetchInvoiceHeaders(
  supabase: any,
  distributorId: string,
  range: AnalyticsRange
): Promise<Array<{ id: string; order_id: string | null; vendor_id: string | null; created_at: string; deleted_at: string | null }>> {
  const modern = await applyDateRange(
    supabase
      .from('invoices')
      .select('id, order_id, vendor_id, created_at, deleted_at')
      .eq('distributor_id', distributorId),
    range
  )

  if (modern.error && modern.error.code === '42703') {
    const legacy = await applyDateRange(
      supabase
        .from('invoices')
        .select('id, order_id, vendor_id, created_at')
        .eq('distributor_id', distributorId),
      range
    )
    if (legacy.error) throw new Error(legacy.error.message)

    return (legacy.data || []).map((row: any) => ({
      id: String(row.id),
      order_id: row.order_id ? String(row.order_id) : null,
      vendor_id: row.vendor_id ? String(row.vendor_id) : null,
      created_at: String(row.created_at),
      deleted_at: null
    }))
  }

  if (modern.error) throw new Error(modern.error.message)

  return (modern.data || []).map((row: any) => ({
    id: String(row.id),
    order_id: row.order_id ? String(row.order_id) : null,
    vendor_id: row.vendor_id ? String(row.vendor_id) : null,
    created_at: String(row.created_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null
  }))
}

async function fetchInvoiceItems(supabase: any, invoiceIds: string[]): Promise<any[]> {
  if (!invoiceIds.length) return []

  const modern = await supabase
    .from('invoice_items')
    .select(`
      invoice_id,
      product_id,
      product_name,
      product_name_snapshot,
      category_name,
      category_name_snapshot,
      category_label,
      category_id,
      is_manual,
      qty,
      order_unit,
      order_mode,
      cases_qty,
      pieces_qty,
      units_per_case_snapshot,
      total_pieces,
      quantity_snapshot,
      unit_price,
      unit_price_snapshot,
      case_price_snapshot,
      ext_amount,
      line_total_snapshot,
      unit_cost,
      products (
        id,
        name,
        sell_price,
        price_case,
        sell_per_unit,
        sell_per_case,
        cost_price,
        cost_case,
        cost_per_unit,
        cost_per_case,
        categories (
          id,
          name
        )
      )
    `)
    .in('invoice_id', invoiceIds)

  if (modern.error && modern.error.code === '42703') {
    const legacy = await supabase
      .from('invoice_items')
      .select(`
        invoice_id,
        product_id,
        product_name,
        category_name,
        is_manual,
        qty,
        order_unit,
        cases_qty,
        pieces_qty,
        units_per_case_snapshot,
        total_pieces,
        unit_price,
        ext_amount,
        unit_cost,
        products (
          id,
          name,
          sell_price,
          price_case,
          sell_per_unit,
          sell_per_case,
          cost_price,
          cost_case,
          cost_per_unit,
          cost_per_case,
          categories (
            id,
            name
          )
        )
      `)
      .in('invoice_id', invoiceIds)

    if (legacy.error) throw new Error(legacy.error.message)
    return legacy.data || []
  }

  if (modern.error) throw new Error(modern.error.message)
  return modern.data || []
}

async function fetchOrderItems(
  supabase: any,
  distributorId: string,
  range: AnalyticsRange
): Promise<any[]> {
  const modern = await applyDateRange(
    supabase
      .from('order_items')
      .select(`
        order_id,
        product_id,
        product_name,
        edited_name,
        removed,
        qty,
        edited_qty,
        order_unit,
        cases_qty,
        pieces_qty,
        units_per_case_snapshot,
        total_pieces,
        unit_price,
        edited_unit_price,
        unit_price_snapshot,
        case_price_snapshot,
        selling_price_at_time,
        unit_cost,
        cost_price_at_time,
        products (
          id,
          name,
          sell_price,
          price_case,
          sell_per_unit,
          sell_per_case,
          cost_price,
          cost_case,
          cost_per_unit,
          cost_per_case,
          categories (
            id,
            name
          )
        ),
        orders!inner (
          id,
          vendor_id,
          distributor_id,
          status,
          created_at
        )
      `)
      .eq('orders.distributor_id', distributorId)
      .neq('orders.status', 'cancelled'),
    range,
    'orders.created_at'
  )

  if (modern.error && modern.error.code === '42703') {
    const legacy = await applyDateRange(
      supabase
        .from('order_items')
        .select(`
          order_id,
          product_id,
          product_name,
          qty,
          order_unit,
          cases_qty,
          pieces_qty,
          units_per_case_snapshot,
          total_pieces,
          unit_price,
          unit_cost,
          products (
            id,
            name,
            sell_price,
            price_case,
            sell_per_unit,
            sell_per_case,
            cost_price,
            cost_case,
            cost_per_unit,
            cost_per_case,
            categories (
              id,
              name
            )
          ),
          orders!inner (
            id,
            vendor_id,
            distributor_id,
            status,
            created_at
          )
        `)
        .eq('orders.distributor_id', distributorId)
        .neq('orders.status', 'cancelled'),
      range,
      'orders.created_at'
    )

    if (legacy.error) throw new Error(legacy.error.message)
    return legacy.data || []
  }

  if (modern.error) throw new Error(modern.error.message)
  return modern.data || []
}

export async function fetchDistributorTransactionLines(
  supabase: any,
  distributorId: string,
  range: AnalyticsRange
): Promise<NormalizedTransactionLine[]> {
  const invoiceHeaders = await fetchInvoiceHeaders(supabase, distributorId, range)
  const activeInvoices = invoiceHeaders.filter((row) => row.deleted_at == null)

  const invoiceMap = new Map(activeInvoices.map((row) => [row.id, row] as const))
  const invoicedOrderIds = new Set(
    activeInvoices
      .map((row) => row.order_id)
      .filter((value): value is string => Boolean(value))
  )

  const invoiceItems = await fetchInvoiceItems(supabase, activeInvoices.map((row) => row.id))

  const invoiceLines: NormalizedTransactionLine[] = []
  for (const row of invoiceItems) {
    const invoiceId = row?.invoice_id ? String(row.invoice_id) : ''
    if (!invoiceId) continue

    const header = invoiceMap.get(invoiceId)
    if (!header) continue

    const normalized = normalizeTransactionLine(row, {
      sourceType: 'invoice',
      sourceId: invoiceId,
      sourceDate: header.created_at,
      vendorId: header.vendor_id,
      orderId: header.order_id
    })

    if (normalized.isManual) continue
    invoiceLines.push(normalized)
  }

  const orderItems = await fetchOrderItems(supabase, distributorId, range)

  const orderLines: NormalizedTransactionLine[] = []
  for (const row of orderItems) {
    const order = Array.isArray(row?.orders) ? row.orders[0] : row?.orders
    const orderId = row?.order_id ? String(row.order_id) : order?.id ? String(order.id) : ''
    if (!orderId) continue

    if (invoicedOrderIds.has(orderId)) continue
    if (row?.removed === true) continue

    const normalized = normalizeTransactionLine(row, {
      sourceType: 'order',
      sourceId: orderId,
      sourceDate: String(order?.created_at || ''),
      vendorId: order?.vendor_id ? String(order.vendor_id) : null,
      orderId
    })

    if (normalized.isManual) continue
    orderLines.push(normalized)
  }

  return [...invoiceLines, ...orderLines]
}
