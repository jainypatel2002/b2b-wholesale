import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { isUuid } from '@/lib/vendor/favorites'
import { isMissingDraftTableError, normalizeDraftRow } from '@/lib/vendor/drafts'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  const result = await supabase
    .from('vendor_draft_orders')
    .select('id,vendor_id,distributor_id,name,status,currency,cart_payload,subtotal_snapshot,created_at,updated_at')
    .eq('id', id)
    .eq('vendor_id', vendor.userId)
    .maybeSingle()

  if (result.error) {
    if (isMissingDraftTableError(result.error)) {
      return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
    }
    return NextResponse.json({ error: result.error.message }, { status: 400 })
  }

  if (!result.data) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const draft = normalizeDraftRow(result.data)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  return NextResponse.json({ ok: true, draft })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  const result = await supabase
    .from('vendor_draft_orders')
    .delete()
    .eq('id', id)
    .eq('vendor_id', vendor.userId)
    .select('id')
    .maybeSingle()

  if (result.error) {
    if (isMissingDraftTableError(result.error)) {
      return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
    }
    return NextResponse.json({ error: result.error.message }, { status: 400 })
  }

  if (!result.data?.id) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, id: result.data.id })
}

