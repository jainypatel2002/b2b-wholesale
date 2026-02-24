import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { getLastOrderWithItems } from '@/lib/vendor/last-order'
import { isUuid } from '@/lib/vendor/favorites'

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const distributorId = String(request.nextUrl.searchParams.get('distributorId') || '').trim()
  if (!isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  const { data: link, error: linkError } = await supabase
    .from('distributor_vendors')
    .select('distributor_id')
    .eq('vendor_id', auth.user.id)
    .eq('distributor_id', distributorId)
    .limit(1)
    .maybeSingle()

  if (linkError && linkError.code !== 'PGRST116') {
    return NextResponse.json({ error: linkError.message }, { status: 400 })
  }

  if (!link) {
    return NextResponse.json({ error: 'Vendor is not linked to this distributor' }, { status: 403 })
  }

  try {
    const lastOrder = await getLastOrderWithItems({
      supabase,
      vendorId: auth.user.id,
      distributorId
    })

    return NextResponse.json({ ok: true, last_order: lastOrder })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load last order' }, { status: 400 })
  }
}
