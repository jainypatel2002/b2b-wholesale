import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

type CartItem = { product_id: string; qty: number }

export async function POST(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const items: CartItem[] = Array.isArray(body?.items) ? body.items : []

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

  // Load products to snapshot cost/price
  const productIds = items.map((i) => i.product_id)
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id,distributor_id,cost_price,sell_price')
    .in('id', productIds)
    .eq('distributor_id', link.distributor_id)

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 400 })

  const byId = new Map((products ?? []).map((p: any) => [p.id, p]))
  for (const it of items) {
    if (!byId.has(it.product_id)) return NextResponse.json({ error: 'One or more products invalid' }, { status: 400 })
  }

  // Create order
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

  const orderItems = items.map((it) => {
    const p: any = byId.get(it.product_id)
    return {
      order_id: order.id,
      product_id: it.product_id,
      qty: it.qty,
      unit_price: p.sell_price,
      unit_cost: p.cost_price
    }
  })

  const { error: itemErr } = await supabase.from('order_items').insert(orderItems)
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, order_id: order.id })
}
