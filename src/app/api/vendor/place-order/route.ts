import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

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

  if (!items.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (items.some((i) => !i.product_id || !Number.isFinite(i.qty) || i.qty <= 0)) {
    return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })
  }

  // Vendor must be linked to a distributor
  const { data: link } = await supabase
    .from('distributor_vendors')
    .select('distributor_id')
    .eq('vendor_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!link?.distributor_id) return NextResponse.json({ error: 'Vendor not linked to distributor' }, { status: 400 })

  // 1. Load products to validate stock and calculate totals
  const productIds = items.map((i) => i.product_id)
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id,distributor_id,cost_price,sell_price,stock_pieces,allow_case,allow_piece,units_per_case,name')
    .in('id', productIds)
    .eq('distributor_id', link.distributor_id)

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 400 })

  const byId = new Map((products ?? []).map((p: any) => [p.id, p]))
  const updates = []
  const orderItemsData = []

  // 2. Validate and prepare updates (Optimistic check before DB transaction)
  // Note: True race condition safety requires database functions or serializable isolation, 
  // but for this app complexity, checking before writing is the first step.
  // We will issue individual updates that respect the check.

  for (const it of items) {
    const p = byId.get(it.product_id)
    if (!p) return NextResponse.json({ error: `Product not found: ${it.product_id}` }, { status: 400 })

    const isCase = it.order_unit === 'case'
    const isPiece = it.order_unit === 'piece'

    // Validate Unit Capability
    if (isCase && !p.allow_case) return NextResponse.json({ error: `Product ${p.name} cannot be ordered by case` }, { status: 400 })
    if (isPiece && !p.allow_piece) return NextResponse.json({ error: `Product ${p.name} cannot be ordered by piece` }, { status: 400 })

    // Calculate effective pieces
    const unitsPerCase = p.units_per_case || 1
    const totalPiecesRequired = isCase ? (it.qty * unitsPerCase) : it.qty

    // Check Stock
    const currentStock = p.stock_pieces || 0
    if (currentStock < totalPiecesRequired) {
      return NextResponse.json({ error: `Insufficient stock for ${p.name}. Requested: ${totalPiecesRequired}, Available: ${currentStock}` }, { status: 400 })
    }

    // Prepare calculations
    // Price logic: Currently assuming sell_price is per piece. 
    // If case, price = sell_price * units_per_case.
    const unitPriceSnapshot = Number(p.sell_price || 0)
    const lineTotal = unitPriceSnapshot * totalPiecesRequired

    orderItemsData.push({
      product_id: p.id,
      order_unit: it.order_unit, // 'piece' or 'case'
      cases_qty: isCase ? it.qty : null,
      pieces_qty: isPiece ? it.qty : null,
      units_per_case_snapshot: isCase ? unitsPerCase : null,
      unit_price_snapshot: unitPriceSnapshot,
      total_pieces: totalPiecesRequired,
      // Legacy fields
      qty: totalPiecesRequired, // Store total pieces in legacy qty for backward compat
      unit_price: unitPriceSnapshot,
      unit_cost: p.cost_price
    })

    // Decrement helper
    // We will run this serially or via RPC in a real high-concurrency app. 
    // Here we'll do an optimistic decrements loop.
    updates.push({ id: p.id, decrement: totalPiecesRequired })
  }

  // 3. Create Order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      distributor_id: link.distributor_id,
      vendor_id: auth.user.id,
      status: 'placed'
    })
    .select('id')
    .single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 })

  // 4. Create Items
  const itemsToInsert = orderItemsData.map(i => ({ ...i, order_id: order.id }))
  const { error: itemErr } = await supabase.from('order_items').insert(itemsToInsert)

  if (itemErr) {
    console.error("ORDER ITEM ERROR", itemErr)
    // In a real app we would rollback order here by deleting the created order
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json({
      error: `Failed to create order items: ${itemErr.message || itemErr.details || 'Unknown error'}`,
      details: itemErr
    }, { status: 500 })
  }

  // 5. Deduct Inventory - MOVED TO FULFILLMENT
  // We no longer deduct stock at placement. Stock is deducted only when the distributor fulfills the order.
  // This prevents double deduction and ensures atomic updates via the fulfill_order RPC.

  return NextResponse.json({ ok: true, order_id: order.id })
}
