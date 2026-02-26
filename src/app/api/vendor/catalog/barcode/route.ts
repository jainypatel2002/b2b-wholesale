import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { resolveProductByBarcode } from '@/lib/barcodes/resolver'
import { normalizeBarcode } from '@/lib/utils/barcode'
import { isUuid } from '@/lib/vendor/favorites'

type CatalogProductMatch = {
  id: string
  name: string
  sku: string | null
  allow_piece: boolean
  allow_case: boolean
  units_per_case: number
  sell_per_unit: number | null
  sell_per_case: number | null
  override_unit_price: number | null
  override_case_price: number | null
}

type LinkedDistributorSuggestion = {
  distributorId: string
  distributorName: string
  matches: CatalogProductMatch[]
}

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

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toDollarsFromCents(value: unknown): number | null {
  const cents = toNumber(value)
  if (cents == null) return null
  return Math.round((cents / 100) * 1_000_000) / 1_000_000
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = toNumber(value)
    if (n != null) return n
  }
  return null
}

function mapRpcRows(rows: any[]): CatalogProductMatch[] {
  return (rows ?? [])
    .map((row: any) => {
      const unitsPerCase = Math.max(1, Math.floor(Number(row.units_per_case || 1)))
      const baseUnitFromLegacy = toDollarsFromCents(row.base_price_cents)
      const baseCaseFromLegacy = toDollarsFromCents(row.base_price_case_cents)
      const effectiveUnitFromLegacy = toDollarsFromCents(row.effective_price_cents)

      const baseUnitPrice = pickFirstNumber(
        row.base_unit_price,
        row.sell_per_unit,
        row.sell_price,
        baseUnitFromLegacy,
        effectiveUnitFromLegacy
      )
      const baseCasePrice = pickFirstNumber(
        row.base_case_price,
        row.sell_per_case,
        row.price_case,
        baseCaseFromLegacy
      )
      const overrideUnitPriceRaw = pickFirstNumber(
        row.override_unit_price,
        toDollarsFromCents(row.override_unit_price_cents)
      )
      const inferredOverrideUnitPrice = (
        overrideUnitPriceRaw == null
        && effectiveUnitFromLegacy != null
        && baseUnitFromLegacy != null
        && Math.abs(effectiveUnitFromLegacy - baseUnitFromLegacy) > 0.000001
      ) ? effectiveUnitFromLegacy : null

      return {
        id: String(row.id ?? row.product_id ?? ''),
        name: String(row.name || 'Unknown product'),
        sku: row.sku == null ? null : String(row.sku),
        allow_piece: row.allow_piece !== false,
        allow_case: row.allow_case !== false,
        units_per_case: unitsPerCase,
        sell_per_unit: baseUnitPrice,
        sell_per_case: baseCasePrice ?? (
          baseUnitPrice == null
            ? null
            : Math.round((baseUnitPrice * unitsPerCase) * 1_000_000) / 1_000_000
        ),
        override_unit_price: overrideUnitPriceRaw ?? inferredOverrideUnitPrice,
        override_case_price: pickFirstNumber(
          row.override_case_price,
          toDollarsFromCents(row.override_case_price_cents)
        )
      } satisfies CatalogProductMatch
    })
    .filter((row) => isUuid(row.id))
}

async function fetchMatchesViaRpc(
  supabase: any,
  distributorId: string,
  productIds: string[]
): Promise<CatalogProductMatch[] | null> {
  const result = await supabase
    .rpc('get_vendor_catalog_prices', { p_distributor_id: distributorId })
    .in('id', productIds)

  if (result.error) {
    if (result.error.code === 'PGRST202') return null
    const msg = String(result.error.message || '')
    if (msg.includes('get_vendor_catalog_prices')) return null
    throw new Error(result.error.message || 'Failed to load catalog pricing')
  }

  const mapped = mapRpcRows(result.data ?? [])
  if (mapped.length === 0 && productIds.length > 0) {
    return null
  }

  const productIdSet = new Set(productIds)
  const scoped = mapped.filter((row) => productIdSet.has(row.id))
  if (scoped.length === 0 && productIds.length > 0) {
    return null
  }

  return scoped
}

async function fetchMatchesFallback(
  supabase: any,
  distributorId: string,
  vendorId: string,
  productIds: string[]
): Promise<CatalogProductMatch[]> {
  let productsResult = await supabase
    .from('products')
    .select('id,name,sku,sell_per_unit,sell_per_case,sell_price,price_case,allow_piece,allow_case,units_per_case')
    .eq('distributor_id', distributorId)
    .in('id', productIds)
    .is('deleted_at', null)

  if (productsResult.error && productsResult.error.code === '42703') {
    productsResult = await supabase
      .from('products')
      .select('id,name,sku,sell_per_unit,sell_per_case,sell_price,price_case,allow_piece,allow_case,units_per_case')
      .eq('distributor_id', distributorId)
      .in('id', productIds)
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message || 'Failed to load products')
  }

  const overridesResult = await supabase
    .from('vendor_price_overrides')
    .select('product_id,price_per_unit,price_per_case')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)
    .in('product_id', productIds)

  if (overridesResult.error) {
    throw new Error(overridesResult.error.message || 'Failed to load vendor overrides')
  }

  const overrideMap = new Map<string, { unit: number | null; case: number | null }>(
    (overridesResult.data ?? []).map((row: any) => [
      String(row.product_id),
      {
        unit: toNumber(row.price_per_unit),
        case: toNumber(row.price_per_case)
      }
    ])
  )

  return (productsResult.data ?? []).map((row: any) => {
    const override = overrideMap.get(String(row.id))
    return {
      id: String(row.id),
      name: String(row.name || 'Unknown product'),
      sku: row.sku == null ? null : String(row.sku),
      allow_piece: row.allow_piece !== false,
      allow_case: row.allow_case !== false,
      units_per_case: Math.max(1, Math.floor(Number(row.units_per_case || 1))),
      sell_per_unit: toNumber(row.sell_per_unit ?? row.sell_price),
      sell_per_case: toNumber(row.sell_per_case ?? row.price_case),
      override_unit_price: override?.unit ?? null,
      override_case_price: override?.case ?? null
    } satisfies CatalogProductMatch
  })
}

async function fetchLinkedDistributors(
  supabase: any,
  vendorId: string
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('distributor_vendors')
    .select('distributor_id,distributor:profiles!distributor_id(id,display_name,email)')
    .eq('vendor_id', vendorId)

  if (error) {
    throw new Error(error.message || 'Failed to load linked distributors')
  }

  return (data ?? [])
    .map((row: any) => {
      const distributor = row.distributor
      return {
        id: String(row.distributor_id || distributor?.id || ''),
        name: String(distributor?.display_name || distributor?.email || 'Distributor')
      }
    })
    .filter((row: { id: string }) => isUuid(row.id))
}

async function resolveDistributorMatches(params: {
  supabase: any
  vendorId: string
  distributorId: string
  barcode: string
}): Promise<CatalogProductMatch[]> {
  const { supabase, vendorId, distributorId, barcode } = params

  const resolved = await resolveProductByBarcode({
    supabase,
    distributorId,
    barcode,
    viewerRole: 'vendor',
    vendorId
  })

  if (!resolved) return []

  const productId = String(resolved.product?.id || '')
  if (!isUuid(productId)) return []

  const productIds = [productId]
  const rpcMatches = await fetchMatchesViaRpc(supabase, distributorId, productIds)
  const matches = rpcMatches ?? await fetchMatchesFallback(supabase, distributorId, vendorId, productIds)
  return matches.slice(0, 10)
}

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const distributorId = String(request.nextUrl.searchParams.get('distributorId') || '').trim()
  const barcodeRaw = String(request.nextUrl.searchParams.get('barcode') || '')
  const searchLinked = ['1', 'true', 'yes'].includes(
    String(request.nextUrl.searchParams.get('searchLinked') || '').toLowerCase()
  )
  const barcode = normalizeBarcode(barcodeRaw)

  if (!isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  if (!barcode || barcode.length < 6) {
    return NextResponse.json({ error: 'Invalid barcode' }, { status: 400 })
  }

  try {
    const matches = await resolveDistributorMatches({
      supabase,
      vendorId: vendor.userId,
      distributorId,
      barcode
    })

    if (matches.length > 0 || !searchLinked) {
      return NextResponse.json({
        ok: true,
        barcode,
        distributorId,
        matches
      })
    }

    const linkedDistributors = await fetchLinkedDistributors(supabase, vendor.userId)
    const alternatives = linkedDistributors.filter((linked) => linked.id !== distributorId)

    let linkedSuggestion: LinkedDistributorSuggestion | null = null

    for (const linked of alternatives) {
      const linkedMatches = await resolveDistributorMatches({
        supabase,
        vendorId: vendor.userId,
        distributorId: linked.id,
        barcode
      })

      if (linkedMatches.length > 0) {
        linkedSuggestion = {
          distributorId: linked.id,
          distributorName: linked.name,
          matches: linkedMatches
        }
        break
      }
    }

    return NextResponse.json({
      ok: true,
      barcode,
      distributorId,
      matches: [],
      linkedDistributorCount: linkedDistributors.length,
      linkedSuggestion
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to lookup barcode' }, { status: 500 })
  }
}
