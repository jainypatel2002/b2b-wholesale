import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { createOrder, type CreateOrderItemInput } from '@/lib/orders/create-order'

export async function POST(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const items: CreateOrderItemInput[] = Array.isArray(body?.items) ? body.items : []
  const requestedDistributorId: string | undefined = body?.distributorId

  if (!items.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (items.some((i) => !i.product_id || !Number.isFinite(i.qty) || i.qty <= 0 || (i.order_unit !== 'piece' && i.order_unit !== 'case'))) {
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

  const result = await createOrder({
    supabase,
    distributorId,
    vendorId: auth.user.id,
    items,
    createdByUserId: auth.user.id,
    createdByRole: 'vendor',
    createdSource: 'vendor_portal',
    allowCatalogRecovery: true
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        invalidItems: result.invalidItems,
        shouldRetry: result.shouldRetry,
        details: result.details
      },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, order_id: result.orderId })
}
