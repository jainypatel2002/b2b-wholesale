import { getEffectivePrice, type UnitType } from '@/lib/pricing/getEffectivePrice'
import type { CartStorageItem, ReorderSkippedItem } from '@/lib/vendor/reorder'

type CatalogRow = {
  id: string
  name: string
  base_unit_price: number | null
  base_case_price: number | null
  override_unit_price: number | null
  override_case_price: number | null
  allow_piece: boolean
  allow_case: boolean
  units_per_case: number | null
  is_active: boolean
}

type BulkRow = {
  product_id: string
  price_per_unit: number | null
  price_per_case: number | null
}

type LastOrderRow = {
  id: string
  created_at: string
}

type LastOrderItemRow = {
  product_id: string
  qty: number
  order_unit: string
  units_per_case_snapshot: number | null
  product_name: string | null
}

export type LastOrderWithItems = {
  orderId: string
  createdAt: string
  items: CartStorageItem[]
  skipped: ReorderSkippedItem[]
}

function isMissingColumnError(error: any): boolean {
  return error?.code === '42703'
}

function toOrderUnit(value: unknown): UnitType | null {
  if (value === 'piece' || value === 'case') return value
  return null
}

async function fetchLatestOrder(
  supabase: any,
  vendorId: string,
  distributorId: string
): Promise<LastOrderRow | null> {
  let query = supabase
    .from('orders')
    .select('id,created_at')
    .eq('vendor_id', vendorId)
    .eq('distributor_id', distributorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let result = await query

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from('orders')
      .select('id,created_at')
      .eq('vendor_id', vendorId)
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  if (result.error) {
    throw new Error(result.error.message || 'Failed to load last order')
  }

  return (result.data ?? null) as LastOrderRow | null
}

async function fetchLastOrderItems(supabase: any, orderId: string): Promise<LastOrderItemRow[]> {
  let result = await supabase
    .from('order_items')
    .select('product_id,qty,order_unit,units_per_case_snapshot,product_name')
    .eq('order_id', orderId)

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from('order_items')
      .select('product_id,qty,order_unit,units_per_case_snapshot')
      .eq('order_id', orderId)
  }

  if (result.error) {
    throw new Error(result.error.message || 'Failed to load order items')
  }

  const rows = (result.data ?? []) as Array<Record<string, any>>
  return rows.map((row) => ({
    product_id: String(row.product_id || ''),
    qty: Number(row.qty || 0),
    order_unit: String(row.order_unit || ''),
    units_per_case_snapshot: row.units_per_case_snapshot == null ? null : Number(row.units_per_case_snapshot),
    product_name: typeof row.product_name === 'string' ? row.product_name : null
  }))
}

async function fetchCatalogRowsViaRpc(
  supabase: any,
  distributorId: string,
  productIds: string[]
): Promise<{ rows: CatalogRow[]; rpcMissing: boolean }> {
  const result = await supabase
    .rpc('get_vendor_catalog_prices', { p_distributor_id: distributorId })
    .in('id', productIds)

  if (result.error) {
    if (result.error.code === 'PGRST202') {
      return { rows: [], rpcMissing: true }
    }
    throw new Error(result.error.message || 'Failed to load catalog pricing')
  }

  const rows = ((result.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    name: String(row.name || 'Unknown product'),
    base_unit_price: row.base_unit_price == null ? null : Number(row.base_unit_price),
    base_case_price: row.base_case_price == null ? null : Number(row.base_case_price),
    override_unit_price: row.override_unit_price == null ? null : Number(row.override_unit_price),
    override_case_price: row.override_case_price == null ? null : Number(row.override_case_price),
    allow_piece: row.allow_piece !== false,
    allow_case: row.allow_case !== false,
    units_per_case: row.units_per_case == null ? null : Number(row.units_per_case),
    is_active: row.is_active !== false
  }))

  return { rows, rpcMissing: false }
}

async function fetchCatalogRowsFallback(
  supabase: any,
  distributorId: string,
  vendorId: string,
  productIds: string[]
): Promise<CatalogRow[]> {
  const baseFields = 'id,name,sell_per_unit,sell_per_case,sell_price,price_case,allow_piece,allow_case,units_per_case'
  let productsResult = await supabase
    .from('products')
    .select(`${baseFields},is_active`)
    .eq('distributor_id', distributorId)
    .in('id', productIds)
    .is('deleted_at', null)

  if (productsResult.error && isMissingColumnError(productsResult.error)) {
    productsResult = await supabase
      .from('products')
      .select(`${baseFields},active`)
      .eq('distributor_id', distributorId)
      .in('id', productIds)
      .is('deleted_at', null)
  }

  if (productsResult.error && isMissingColumnError(productsResult.error)) {
    productsResult = await supabase
      .from('products')
      .select(baseFields)
      .eq('distributor_id', distributorId)
      .in('id', productIds)
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message || 'Failed to load products')
  }

  const { data: overrides, error: overridesError } = await supabase
    .from('vendor_price_overrides')
    .select('product_id,price_per_unit,price_per_case')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)
    .in('product_id', productIds)

  if (overridesError) {
    throw new Error(overridesError.message || 'Failed to load vendor overrides')
  }

  const overrideMap = new Map<string, { unit: number | null; case: number | null }>(
    ((overrides ?? []) as Array<Record<string, any>>).map((row) => [
      String(row.product_id),
      {
        unit: row.price_per_unit == null ? null : Number(row.price_per_unit),
        case: row.price_per_case == null ? null : Number(row.price_per_case)
      }
    ])
  )

  return ((productsResult.data ?? []) as Array<Record<string, any>>).map((row) => {
    const override = overrideMap.get(String(row.id))
    const isActive =
      row.is_active == null
        ? row.active == null
          ? true
          : row.active !== false
        : row.is_active !== false

    return {
      id: String(row.id),
      name: String(row.name || 'Unknown product'),
      base_unit_price: row.sell_per_unit == null ? (row.sell_price == null ? null : Number(row.sell_price)) : Number(row.sell_per_unit),
      base_case_price: row.sell_per_case == null ? (row.price_case == null ? null : Number(row.price_case)) : Number(row.sell_per_case),
      override_unit_price: override?.unit ?? null,
      override_case_price: override?.case ?? null,
      allow_piece: row.allow_piece !== false,
      allow_case: row.allow_case !== false,
      units_per_case: row.units_per_case == null ? null : Number(row.units_per_case),
      is_active: isActive
    } as CatalogRow
  })
}

async function fetchCatalogRows(
  supabase: any,
  distributorId: string,
  vendorId: string,
  productIds: string[]
): Promise<CatalogRow[]> {
  const rpcResult = await fetchCatalogRowsViaRpc(supabase, distributorId, productIds)
  if (!rpcResult.rpcMissing) return rpcResult.rows
  return fetchCatalogRowsFallback(supabase, distributorId, vendorId, productIds)
}

async function fetchBulkRows(
  supabase: any,
  distributorId: string,
  productIds: string[]
): Promise<Map<string, BulkRow>> {
  const result = await supabase
    .from('bulk_pricing')
    .select('product_id,price_per_unit,price_per_case')
    .eq('distributor_id', distributorId)
    .in('product_id', productIds)

  if (result.error) {
    return new Map()
  }

  const rows = (result.data ?? []) as Array<Record<string, any>>
  return new Map(
    rows.map((row) => [
      String(row.product_id),
      {
        product_id: String(row.product_id),
        price_per_unit: row.price_per_unit == null ? null : Number(row.price_per_unit),
        price_per_case: row.price_per_case == null ? null : Number(row.price_per_case)
      } satisfies BulkRow
    ])
  )
}

export async function getLastOrderWithItems(params: {
  supabase: any
  vendorId: string
  distributorId: string
}): Promise<LastOrderWithItems | null> {
  const { supabase, vendorId, distributorId } = params

  const order = await fetchLatestOrder(supabase, vendorId, distributorId)
  if (!order) return null

  const rawItems = await fetchLastOrderItems(supabase, order.id)
  if (!rawItems.length) {
    return { orderId: order.id, createdAt: order.created_at, items: [], skipped: [] }
  }

  const productIds = Array.from(new Set(rawItems.map((item) => item.product_id).filter(Boolean)))
  if (!productIds.length) {
    return { orderId: order.id, createdAt: order.created_at, items: [], skipped: [] }
  }

  const [catalogRows, bulkMap] = await Promise.all([
    fetchCatalogRows(supabase, distributorId, vendorId, productIds),
    fetchBulkRows(supabase, distributorId, productIds)
  ])

  const catalogMap = new Map(catalogRows.map((row) => [row.id, row]))
  const items: CartStorageItem[] = []
  const skipped: ReorderSkippedItem[] = []

  for (const raw of rawItems) {
    const productId = raw.product_id
    const orderUnit = toOrderUnit(raw.order_unit)
    const qty = Number(raw.qty)
    const snapshotName = raw.product_name || `Product ${productId.slice(0, 8)}`

    if (!productId || !orderUnit) {
      skipped.push({
        product_id: productId,
        name: snapshotName,
        reason: 'Skipped invalid line item from previous order'
      })
      continue
    }

    if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
      skipped.push({
        product_id: productId,
        name: snapshotName,
        reason: 'Skipped invalid quantity from previous order'
      })
      continue
    }

    const product = catalogMap.get(productId)
    if (!product || !product.is_active) {
      skipped.push({
        product_id: productId,
        name: snapshotName,
        reason: 'Product is unavailable in the current catalog'
      })
      continue
    }

    if (orderUnit === 'case' && !product.allow_case) {
      skipped.push({
        product_id: productId,
        name: product.name,
        reason: 'Case ordering is no longer available'
      })
      continue
    }

    if (orderUnit === 'piece' && !product.allow_piece) {
      skipped.push({
        product_id: productId,
        name: product.name,
        reason: 'Unit ordering is no longer available'
      })
      continue
    }

    const bulk = bulkMap.get(product.id)
    const priceResult = getEffectivePrice({
      unitType: orderUnit,
      product: {
        sell_per_unit: product.base_unit_price,
        sell_per_case: product.base_case_price,
        units_per_case: product.units_per_case
      },
      vendorOverride: {
        price_per_unit: product.override_unit_price,
        price_per_case: product.override_case_price
      },
      bulkOverride: {
        price_per_unit: bulk?.price_per_unit ?? null,
        price_per_case: bulk?.price_per_case ?? null
      }
    })

    if (!priceResult.price || priceResult.price <= 0) {
      skipped.push({
        product_id: product.id,
        name: product.name,
        reason: 'Current price is not available'
      })
      continue
    }

    const unitsPerCase =
      product.units_per_case && product.units_per_case > 0
        ? Math.floor(product.units_per_case)
        : raw.units_per_case_snapshot && raw.units_per_case_snapshot > 0
          ? Math.floor(raw.units_per_case_snapshot)
          : 1

    items.push({
      product_id: product.id,
      name: product.name,
      qty,
      order_unit: orderUnit,
      unit_price: priceResult.price,
      units_per_case: unitsPerCase
    })
  }

  return {
    orderId: order.id,
    createdAt: order.created_at,
    items,
    skipped
  }
}
