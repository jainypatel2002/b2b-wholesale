import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import {
  getEffectivePrice,
  getEffectivePriceOrThrow,
  type ProductPricing,
  MissingEffectivePriceError
} from '@/lib/pricing-engine'

type OrderUnit = 'piece' | 'case'

interface PlaceOrderItem {
  product_id: string
  qty: number
  order_unit: OrderUnit
}

export async function POST(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const items: PlaceOrderItem[] = Array.isArray(body?.items) ? body.items : []
  const requestedDistributorId: string | undefined = body?.distributorId

  if (!items.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (items.some((i) => !i.product_id || !Number.isFinite(i.qty) || i.qty <= 0)) {
    return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })
  }

  // ── Resolve & Validate Distributor Context ──────────────────────────
  // The client sends distributorId (the vendor's active distributor).
  // We verify the vendor is actually linked to that distributor.
  // Fallback: if not provided, use the first linked distributor.
  const { data: links } = await supabase
    .from('distributor_vendors')
    .select('distributor_id')
    .eq('vendor_id', auth.user.id)

  const linkedIds = new Set((links || []).map((l: any) => l.distributor_id))

  let distributorId: string | null = null

  if (requestedDistributorId && linkedIds.has(requestedDistributorId)) {
    distributorId = requestedDistributorId
  } else if (linkedIds.size > 0) {
    // Fallback: pick any linked distributor (first in set)
    distributorId = [...linkedIds][0]
  }

  if (!distributorId) {
    return NextResponse.json({ error: 'Vendor not linked to distributor' }, { status: 400 })
  }

  // ── Load Products (with deleted_at filter) ─────────────────────────
  const productIds = items.map((i) => i.product_id)
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, distributor_id, name, cost_price, sell_price, price_case, stock_pieces, allow_case, allow_piece, units_per_case, cost_per_unit, sell_per_unit, cost_per_case, sell_per_case')
    .in('id', productIds)
    .eq('distributor_id', distributorId)
    .is('deleted_at', null)

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 400 })

  const byId = new Map((products ?? []).map((p: any) => [p.id, p]))

  // ── Cart Validation: Identify invalid items ────────────────────────
  const validItems: PlaceOrderItem[] = []
  const invalidItemIds: string[] = []

  for (const it of items) {
    if (byId.has(it.product_id)) {
      validItems.push(it)
    } else {
      invalidItemIds.push(it.product_id)
    }
  }

  // If there are invalid items, tell the client so it can clean its cart
  if (invalidItemIds.length > 0) {
    if (validItems.length === 0) {
      // ALL items are invalid — nothing to order
      return NextResponse.json({
        error: 'All items in your cart are no longer available. Your cart has been cleared.',
        invalidItems: invalidItemIds
      }, { status: 400 })
    }
    // Some invalid — tell client to remove them and retry
    return NextResponse.json({
      error: 'Some items are no longer available and were removed from your cart.',
      invalidItems: invalidItemIds,
      shouldRetry: true
    }, { status: 400 })
  }

  // ── Load Vendor Pricing Overrides ──────────────────────────────────
  const { data: overrides } = await supabase
    .from('vendor_price_overrides')
    .select('product_id, price_per_unit, price_per_case')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', auth.user.id)
    .in('product_id', productIds)

  const overrideMap = new Map((overrides || []).map((o: any) => [o.product_id, o]))

  // ── Build Order Items ──────────────────────────────────────────────
  const orderItemsData = []

  for (const it of validItems) {
    const p = byId.get(it.product_id)!

    const isCase = it.order_unit === 'case'
    const isPiece = it.order_unit === 'piece'

    // Validate Unit Capability
    if (isCase && !p.allow_case) return NextResponse.json({ error: `Product ${p.name} cannot be ordered by case` }, { status: 400 })
    if (isPiece && !p.allow_piece) return NextResponse.json({ error: `Product ${p.name} cannot be ordered by piece` }, { status: 400 })

    // Calculate effective pieces for stock validation and warehouse deductions
    const unitsPerCase = p.units_per_case || 1
    const totalPiecesRequired = isCase ? (it.qty * unitsPerCase) : it.qty

    // Check Stock
    const currentStock = p.stock_pieces || 0
    if (currentStock < totalPiecesRequired) {
      return NextResponse.json({ error: `Insufficient stock for ${p.name}. Requested: ${totalPiecesRequired}, Available: ${currentStock}` }, { status: 400 })
    }

    // Apply pricing: use explicit source of truth for the chosen mode
    const override = overrideMap.get(p.id)
    const pricingProduct: ProductPricing = {
      sell_per_unit: p.sell_per_unit,
      sell_per_case: p.sell_per_case,
      units_per_case: unitsPerCase,
      allow_piece: p.allow_piece,
      allow_case: p.allow_case,

      // Canonical overrides
      override_unit_price: override?.price_per_unit ?? null,
      override_case_price: override?.price_per_case ?? null,

      // Fallback for incomplete data or legacy reasons
      sell_price: p.sell_price,
      price_case: p.price_case
    }

    let unitPriceSnapshot: number
    try {
      unitPriceSnapshot = getEffectivePriceOrThrow(pricingProduct, it.order_unit as 'piece' | 'case')
    } catch (error) {
      if (error instanceof MissingEffectivePriceError && error.unitType === 'case') {
        return NextResponse.json({ error: `Set case price in inventory before ordering ${p.name} by case` }, { status: 400 })
      }
      return NextResponse.json({ error: `Price is not configured for ${p.name}` }, { status: 400 })
    }

    if (unitPriceSnapshot <= 0) {
      return NextResponse.json({ error: `Price is not configured for ${p.name}` }, { status: 400 })
    }

    const casePriceSnapshot = isCase
      ? unitPriceSnapshot
      : getEffectivePrice(pricingProduct, 'case')

    orderItemsData.push({
      product_id: p.id,
      product_name: p.name,
      order_unit: it.order_unit,
      cases_qty: isCase ? it.qty : null,
      pieces_qty: isPiece ? it.qty : null,
      units_per_case_snapshot: unitsPerCase,
      unit_price_snapshot: unitPriceSnapshot,
      case_price_snapshot: casePriceSnapshot,
      total_pieces: totalPiecesRequired,
      // Profit Center Snapshots
      selling_price_at_time: unitPriceSnapshot,
      cost_price_at_time: p.cost_per_unit ?? p.cost_price ?? 0,
      // Legacy fields
      qty: it.qty,
      unit_price: unitPriceSnapshot,
      unit_cost: p.cost_per_unit ?? p.cost_price
    })

  }

  // ── Create Order ───────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      distributor_id: distributorId,
      vendor_id: auth.user.id,
      status: 'placed'
    })
    .select('id')
    .single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 })

  // ── Create Order Items ─────────────────────────────────────────────
  const itemsToInsert = orderItemsData.map(i => ({ ...i, order_id: order.id }))
  const { error: itemErr } = await supabase.from('order_items').insert(itemsToInsert)

  if (itemErr) {
    console.error("ORDER ITEM ERROR", itemErr)
    // Rollback: delete the empty order
    await supabase.from('orders').delete().eq('id', order.id)

    let errorMessage = `Failed to create order items: ${itemErr.message || itemErr.details || 'Unknown error'}`

    if (JSON.stringify(itemErr).includes('schema cache') || itemErr.message?.includes('schema cache') || itemErr.message?.includes('Could not find the')) {
      errorMessage = "Database schema not updated yet. Please run the latest SQL migrations in Supabase SQL Editor and wait a moment."
    }

    return NextResponse.json({
      error: errorMessage,
      details: itemErr
    }, { status: 500 })
  }

  // Stock deduction is handled at fulfillment time, not at placement.

  return NextResponse.json({ ok: true, order_id: order.id })
}
