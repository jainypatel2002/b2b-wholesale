import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { getFavoriteProductIdsForVendor, isUuid } from '@/lib/vendor/favorites'

function isMissingFavoritesTableError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code === '42P01' || message.includes('vendor_favorites')
}

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const distributorIdParam = request.nextUrl.searchParams.get('distributorId')
  const distributorId = distributorIdParam?.trim() || null

  if (distributorId && !isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  try {
    const productIds = await getFavoriteProductIdsForVendor({
      supabase,
      vendorId: auth.user.id,
      distributorId
    })

    return NextResponse.json({ ok: true, product_ids: productIds })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load favorites' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const productId = String(body?.product_id || '').trim()

  if (!isUuid(productId)) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })
  }

  const existingResult = await supabase
    .from('vendor_favorites')
    .select('id')
    .eq('vendor_id', auth.user.id)
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle()

  if (existingResult.error && existingResult.error.code !== 'PGRST116') {
    if (isMissingFavoritesTableError(existingResult.error)) {
      return NextResponse.json({ error: 'Favorites feature is not available yet' }, { status: 503 })
    }
    return NextResponse.json({ error: existingResult.error.message }, { status: 400 })
  }

  if (existingResult.data?.id) {
    const { error } = await supabase
      .from('vendor_favorites')
      .delete()
      .eq('id', existingResult.data.id)
      .eq('vendor_id', auth.user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, favorited: false })
  }

  const { error } = await supabase
    .from('vendor_favorites')
    .insert({
      vendor_id: auth.user.id,
      product_id: productId
    })

  if (error) {
    if (isMissingFavoritesTableError(error)) {
      return NextResponse.json({ error: 'Favorites feature is not available yet' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, favorited: true })
}
