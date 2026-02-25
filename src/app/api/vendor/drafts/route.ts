import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { isUuid } from '@/lib/vendor/favorites'
import {
  isMissingDraftTableError,
  normalizeDraftCartPayload,
  normalizeDraftRow,
  sanitizeDraftCurrency,
  sanitizeDraftName
} from '@/lib/vendor/drafts'

type DraftMode = 'autosave' | 'named'

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

async function ensureLinkedDistributor(supabase: any, vendorId: string, distributorId: string) {
  const { data: link, error } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('vendor_id', vendorId)
    .eq('distributor_id', distributorId)
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    return { ok: false as const, error: error.message, status: 400 as const }
  }
  if (!link) {
    return { ok: false as const, error: 'Vendor is not linked to this distributor', status: 403 as const }
  }

  return { ok: true as const }
}

function parseSubtotal(input: unknown): number | null {
  const n = Number(input)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const distributorId = String(request.nextUrl.searchParams.get('distributorId') || '').trim()
  const autosaveOnly = request.nextUrl.searchParams.get('autosaveOnly') === '1'

  if (distributorId && !isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  if (distributorId) {
    const linkCheck = await ensureLinkedDistributor(supabase, vendor.userId, distributorId)
    if (!linkCheck.ok) return NextResponse.json({ error: linkCheck.error }, { status: linkCheck.status })
  }

  let query = supabase
    .from('vendor_draft_orders')
    .select('id,vendor_id,distributor_id,name,status,currency,cart_payload,subtotal_snapshot,created_at,updated_at')
    .eq('vendor_id', vendor.userId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })

  if (distributorId) query = query.eq('distributor_id', distributorId)
  if (autosaveOnly) query = query.is('name', null)

  const result = await query
  if (result.error) {
    if (isMissingDraftTableError(result.error)) {
      return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
    }
    return NextResponse.json({ error: result.error.message }, { status: 400 })
  }

  const drafts = (result.data ?? [])
    .map((row: any) => normalizeDraftRow(row))
    .filter((row): row is NonNullable<typeof row> => !!row)

  return NextResponse.json({ ok: true, drafts })
}

export async function POST(request: NextRequest) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const body = await request.json().catch(() => null)
  const modeRaw = String(body?.mode || 'autosave').trim().toLowerCase()
  const mode: DraftMode = modeRaw === 'named' ? 'named' : 'autosave'
  const distributorId = String(body?.distributorId || '').trim()
  const draftId = String(body?.draftId || '').trim()
  const name = sanitizeDraftName(body?.name)
  const currency = sanitizeDraftCurrency(body?.currency)
  const subtotalSnapshot = parseSubtotal(body?.subtotalSnapshot ?? body?.subtotal_snapshot)
  const cartPayload = normalizeDraftCartPayload(body?.cartPayload ?? body?.cart_payload ?? body?.items)

  if (!isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  if (draftId && !isUuid(draftId)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  if (cartPayload.items.length === 0) {
    return NextResponse.json({ error: 'Draft cart is empty' }, { status: 400 })
  }

  const linkCheck = await ensureLinkedDistributor(supabase, vendor.userId, distributorId)
  if (!linkCheck.ok) return NextResponse.json({ error: linkCheck.error }, { status: linkCheck.status })

  const shouldUseAutosave = mode === 'autosave' || (mode === 'named' && !name)
  const targetName = shouldUseAutosave ? null : name

  try {
    if (shouldUseAutosave) {
      const existing = await supabase
        .from('vendor_draft_orders')
        .select('id')
        .eq('vendor_id', vendor.userId)
        .eq('distributor_id', distributorId)
        .eq('status', 'draft')
        .is('name', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing.error && existing.error.code !== 'PGRST116') {
        if (isMissingDraftTableError(existing.error)) {
          return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
        }
        return NextResponse.json({ error: existing.error.message }, { status: 400 })
      }

      if (existing.data?.id) {
        const updateResult = await supabase
          .from('vendor_draft_orders')
          .update({
            cart_payload: cartPayload,
            subtotal_snapshot: subtotalSnapshot,
            currency,
            status: 'draft',
            name: null
          })
          .eq('id', existing.data.id)
          .eq('vendor_id', vendor.userId)
          .select('id,vendor_id,distributor_id,name,status,currency,cart_payload,subtotal_snapshot,created_at,updated_at')
          .single()

        if (updateResult.error) {
          if (isMissingDraftTableError(updateResult.error)) {
            return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
          }
          return NextResponse.json({ error: updateResult.error.message }, { status: 400 })
        }

        return NextResponse.json({ ok: true, draft: normalizeDraftRow(updateResult.data), mode: 'autosave' })
      }
    }

    if (draftId && !shouldUseAutosave) {
      const updateResult = await supabase
        .from('vendor_draft_orders')
        .update({
          cart_payload: cartPayload,
          subtotal_snapshot: subtotalSnapshot,
          currency,
          status: 'draft',
          name: targetName
        })
        .eq('id', draftId)
        .eq('vendor_id', vendor.userId)
        .select('id,vendor_id,distributor_id,name,status,currency,cart_payload,subtotal_snapshot,created_at,updated_at')
        .single()

      if (updateResult.error) {
        if (isMissingDraftTableError(updateResult.error)) {
          return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
        }
        return NextResponse.json({ error: updateResult.error.message }, { status: 400 })
      }

      return NextResponse.json({ ok: true, draft: normalizeDraftRow(updateResult.data), mode: 'named' })
    }

    const insertResult = await supabase
      .from('vendor_draft_orders')
      .insert({
        vendor_id: vendor.userId,
        distributor_id: distributorId,
        name: targetName,
        status: 'draft',
        currency,
        cart_payload: cartPayload,
        subtotal_snapshot: subtotalSnapshot
      })
      .select('id,vendor_id,distributor_id,name,status,currency,cart_payload,subtotal_snapshot,created_at,updated_at')
      .single()

    if (insertResult.error) {
      if (isMissingDraftTableError(insertResult.error)) {
        return NextResponse.json({ error: 'Draft orders feature is not available yet' }, { status: 503 })
      }
      return NextResponse.json({ error: insertResult.error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      draft: normalizeDraftRow(insertResult.data),
      mode: shouldUseAutosave ? 'autosave' : 'named'
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save draft' }, { status: 500 })
  }
}
