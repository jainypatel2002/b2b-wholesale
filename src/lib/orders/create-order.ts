import {
  getEffectivePrices
} from '@/lib/pricing/getEffectivePrice'
import { validateVendorNote } from '@/lib/orders/vendor-note'

export type OrderUnit = 'piece' | 'case'

export interface CreateOrderItemInput {
  product_id: string
  qty: number
  order_unit: OrderUnit
}

export interface CreateOrderParams {
  supabase: any
  distributorId: string
  vendorId: string
  items: CreateOrderItemInput[]
  vendorNote?: string | null
  createdByUserId: string
  createdByRole: 'vendor' | 'distributor'
  createdSource: string
  allowCatalogRecovery?: boolean
}

export type CreateOrderResult =
  | { ok: true; orderId: string }
  | {
    ok: false
    status: number
    error: string
    invalidItems?: string[]
    shouldRetry?: boolean
    details?: unknown
  }

function isMissingMetadataColumnError(error: any): boolean {
  const msg = String(error?.message || '')
  const details = String(error?.details || '')
  const combined = `${msg} ${details}`.toLowerCase()
  return (
    error?.code === '42703'
    || combined.includes('created_by_user_id')
    || combined.includes('created_by_role')
    || combined.includes('created_source')
    || combined.includes('vendor_note')
    || combined.includes('schema cache')
  )
}

interface ProductRow {
  id: string
  name: string
  cost_price: number | null
  sell_price: number | null
  price_case: number | null
  stock_pieces: number | null
  allow_case: boolean
  allow_piece: boolean
  units_per_case: number | null
  cost_per_unit: number | null
  sell_per_unit: number | null
  cost_per_case: number | null
  sell_per_case: number | null
}

interface OverrideRow {
  product_id: string
  price_per_unit: number | null
  price_per_case: number | null
}

export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const {
    supabase,
    distributorId,
    vendorId,
    vendorNote = null,
    createdByUserId,
    createdByRole,
    createdSource,
    allowCatalogRecovery = false
  } = params

  const items = Array.isArray(params.items) ? params.items : []

  if (!distributorId || !vendorId) {
    return { ok: false, status: 400, error: 'Missing distributor or vendor context' }
  }

  if (!items.length) {
    return { ok: false, status: 400, error: 'Cart is empty' }
  }

  for (const item of items) {
    const qty = Number(item.qty)
    if (!item?.product_id || !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return { ok: false, status: 400, error: 'Invalid cart' }
    }
    if (item.order_unit !== 'piece' && item.order_unit !== 'case') {
      return { ok: false, status: 400, error: 'Invalid order unit' }
    }
  }

  const noteValidation = validateVendorNote(vendorNote)
  if (!noteValidation.ok) {
    return { ok: false, status: 400, error: noteValidation.error }
  }

  const { data: link, error: linkError } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)
    .limit(1)
    .maybeSingle()

  if (linkError && linkError.code !== 'PGRST116') {
    return { ok: false, status: 400, error: linkError.message }
  }
  if (!link) {
    return { ok: false, status: 400, error: 'Vendor not linked to distributor' }
  }

  const productIds = items.map((i) => i.product_id)

  const { data: rawProducts, error: productError } = await supabase
    .from('products')
    .select(`
      id,
      distributor_id,
      name,
      cost_price,
      sell_price,
      price_case,
      stock_pieces,
      allow_case,
      allow_piece,
      units_per_case,
      cost_per_unit,
      sell_per_unit,
      cost_per_case,
      sell_per_case
    `)
    .in('id', productIds)
    .eq('distributor_id', distributorId)
    .is('deleted_at', null)

  if (productError) {
    return { ok: false, status: 400, error: productError.message, details: productError }
  }

  const products = (rawProducts ?? []) as ProductRow[]
  const byId = new Map(products.map((p) => [p.id, p] as const))
  const validItems: CreateOrderItemInput[] = []
  const invalidItemIds: string[] = []

  for (const item of items) {
    if (byId.has(item.product_id)) {
      validItems.push(item)
    } else {
      invalidItemIds.push(item.product_id)
    }
  }

  if (invalidItemIds.length > 0) {
    if (allowCatalogRecovery) {
      if (validItems.length === 0) {
        return {
          ok: false,
          status: 400,
          error: 'All items in your cart are no longer available. Your cart has been cleared.',
          invalidItems: invalidItemIds
        }
      }
      return {
        ok: false,
        status: 400,
        error: 'Some items are no longer available and were removed from your cart.',
        invalidItems: invalidItemIds,
        shouldRetry: true
      }
    }

    return {
      ok: false,
      status: 400,
      error: 'Some selected items are no longer available.',
      invalidItems: invalidItemIds
    }
  }

  const { data: rawOverrides, error: overridesError } = await supabase
    .from('vendor_price_overrides')
    .select('product_id, price_per_unit, price_per_case')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)
    .in('product_id', productIds)

  if (overridesError) {
    return { ok: false, status: 400, error: overridesError.message, details: overridesError }
  }

  const overrides = (rawOverrides ?? []) as OverrideRow[]
  const overrideMap = new Map((overrides ?? []).map((o) => [o.product_id, o]))
  const bulkMap = new Map<string, { price_per_unit: number | null; price_per_case: number | null }>()

  // Optional bulk pricing layer. If table/columns are missing, skip silently.
  const { data: rawBulkRows, error: bulkError } = await supabase
    .from('bulk_pricing')
    .select('product_id, price_per_unit, price_per_case')
    .eq('distributor_id', distributorId)
    .in('product_id', productIds)

  const bulkRows = (rawBulkRows ?? []) as OverrideRow[]

  if (!bulkError && Array.isArray(bulkRows)) {
    for (const row of bulkRows) {
      bulkMap.set(row.product_id, {
        price_per_unit: row.price_per_unit ?? null,
        price_per_case: row.price_per_case ?? null
      })
    }
  }

  const orderItemsData: Array<Record<string, any>> = []

  for (const item of validItems) {
    const product = byId.get(item.product_id)
    if (!product) continue
    const isCase = item.order_unit === 'case'
    const isPiece = item.order_unit === 'piece'

    if (isCase && !product.allow_case) {
      return { ok: false, status: 400, error: `Product ${product.name} cannot be ordered by case` }
    }
    if (isPiece && !product.allow_piece) {
      return { ok: false, status: 400, error: `Product ${product.name} cannot be ordered by piece` }
    }

    const unitsPerCase = Number(product.units_per_case || 1)
    const totalPiecesRequired = isCase ? (item.qty * unitsPerCase) : item.qty
    const currentStock = Number(product.stock_pieces || 0)

    if (currentStock < totalPiecesRequired) {
      return {
        ok: false,
        status: 400,
        error: `Insufficient stock for ${product.name}. Requested: ${totalPiecesRequired}, Available: ${currentStock}`
      }
    }

    const override = overrideMap.get(product.id)
    const bulk = bulkMap.get(product.id)
    const pricingInput = {
      product: {
        sell_per_unit: product.sell_per_unit,
        sell_per_case: product.sell_per_case,
        sell_price: product.sell_price,
        price_case: product.price_case,
        units_per_case: unitsPerCase
      },
      vendorOverride: {
        price_per_unit: override?.price_per_unit ?? null,
        price_per_case: override?.price_per_case ?? null
      },
      bulkOverride: {
        price_per_unit: bulk?.price_per_unit ?? null,
        price_per_case: bulk?.price_per_case ?? null
      }
    }

    const effectivePrices = getEffectivePrices(pricingInput)
    const unitPriceSnapshot = effectivePrices.effective_unit_price
    const casePriceSnapshot = effectivePrices.effective_case_price
    const selectedPrice = isCase ? casePriceSnapshot : unitPriceSnapshot

    if (!Number.isFinite(selectedPrice) || Number(selectedPrice) <= 0) {
      if (isCase) {
        return {
          ok: false,
          status: 400,
          error: `Set case price in inventory before ordering ${product.name} by case`
        }
      }
      return {
        ok: false,
        status: 400,
        error: `Set unit price in inventory before ordering ${product.name} by unit`
      }
    }

    const selectedPriceSnapshot = Number(selectedPrice)
    const canonicalUnitPriceSnapshot = Number(
      unitPriceSnapshot
      ?? (casePriceSnapshot && unitsPerCase > 0 ? (casePriceSnapshot / unitsPerCase) : selectedPriceSnapshot)
    )
    const canonicalCasePriceSnapshot = Number(
      casePriceSnapshot
      ?? (unitPriceSnapshot ? (unitPriceSnapshot * unitsPerCase) : selectedPriceSnapshot)
    )

    orderItemsData.push({
      product_id: product.id,
      product_name: product.name,
      order_unit: item.order_unit,
      cases_qty: isCase ? item.qty : null,
      pieces_qty: isPiece ? item.qty : null,
      units_per_case_snapshot: unitsPerCase,
      unit_price_snapshot: canonicalUnitPriceSnapshot,
      case_price_snapshot: canonicalCasePriceSnapshot,
      total_pieces: totalPiecesRequired,
      selling_price_at_time: selectedPriceSnapshot,
      cost_price_at_time: product.cost_per_unit ?? product.cost_price ?? 0,
      qty: item.qty,
      unit_price: selectedPriceSnapshot,
      unit_cost: product.cost_per_unit ?? product.cost_price ?? 0
    })
  }

  const orderPayload: Record<string, any> = {
    distributor_id: distributorId,
    vendor_id: vendorId,
    status: 'placed',
    vendor_note: noteValidation.note,
    created_by_user_id: createdByUserId,
    created_by_role: createdByRole,
    created_source: createdSource
  }

  let orderInsert = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('id')
    .single()

  if (orderInsert.error && isMissingMetadataColumnError(orderInsert.error)) {
    const fallbackPayload = {
      distributor_id: distributorId,
      vendor_id: vendorId,
      status: 'placed'
    }

    orderInsert = await supabase
      .from('orders')
      .insert(fallbackPayload)
      .select('id')
      .single()
  }

  if (orderInsert.error || !orderInsert.data?.id) {
    return {
      ok: false,
      status: 400,
      error: orderInsert.error?.message || 'Failed to create order'
    }
  }

  const orderId = orderInsert.data.id as string
  const itemsToInsert = orderItemsData.map((row) => ({ ...row, order_id: orderId }))

  const { error: itemError } = await supabase
    .from('order_items')
    .insert(itemsToInsert)

  if (itemError) {
    await supabase.from('orders').delete().eq('id', orderId)

    let errorMessage = `Failed to create order items: ${itemError.message || itemError.details || 'Unknown error'}`
    const serialized = JSON.stringify(itemError).toLowerCase()
    const msg = String(itemError?.message || '').toLowerCase()

    if (
      serialized.includes('schema cache')
      || msg.includes('schema cache')
      || msg.includes('could not find the')
    ) {
      errorMessage = 'Database schema not updated yet. Please run the latest SQL migrations in Supabase SQL Editor and wait a moment.'
    }

    return {
      ok: false,
      status: 500,
      error: errorMessage,
      details: itemError
    }
  }

  return { ok: true, orderId }
}
