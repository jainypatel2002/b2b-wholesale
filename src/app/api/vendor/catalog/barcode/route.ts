import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { sanitizeBarcode } from '@/lib/utils/barcode'
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
    .select('id')
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

function toNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function findProductIdsByBarcode(
  supabase: any,
  distributorId: string,
  barcode: string
): Promise<string[]> {
  const fields = 'id,barcode,is_active,active,deleted_at'
  let result = await supabase
    .from('products')
    .select(fields)
    .eq('distributor_id', distributorId)
    .eq('barcode', barcode)
    .is('deleted_at', null)

  if (result.error && result.error.code === '42703') {
    result = await supabase
      .from('products')
      .select('id,barcode,active')
      .eq('distributor_id', distributorId)
      .eq('barcode', barcode)
  }

  if (result.error) {
    throw new Error(result.error.message || 'Failed to lookup barcode')
  }

  return (result.data ?? [])
    .filter((row: any) => {
      const isActive = row?.is_active == null ? row?.active !== false : row?.is_active !== false
      const notDeleted = row?.deleted_at == null
      return isActive && notDeleted
    })
    .map((row: any) => String(row.id || ''))
    .filter((id: string) => isUuid(id))
}

function mapRpcRows(rows: any[]): CatalogProductMatch[] {
  return (rows ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name || 'Unknown product'),
    sku: row.sku == null ? null : String(row.sku),
    allow_piece: row.allow_piece !== false,
    allow_case: row.allow_case !== false,
    units_per_case: Math.max(1, Math.floor(Number(row.units_per_case || 1))),
    sell_per_unit: toNumber(row.base_unit_price),
    sell_per_case: toNumber(row.base_case_price),
    override_unit_price: toNumber(row.override_unit_price),
    override_case_price: toNumber(row.override_case_price)
  }))
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

  return mapRpcRows(result.data ?? [])
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

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)
  const vendor = await requireVendorUser(supabase)
  if ('error' in vendor) return NextResponse.json({ error: vendor.error }, { status: vendor.status })

  const distributorId = String(request.nextUrl.searchParams.get('distributorId') || '').trim()
  const barcodeRaw = String(request.nextUrl.searchParams.get('barcode') || '')
  const barcode = sanitizeBarcode(barcodeRaw)

  if (!isUuid(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400 })
  }

  if (!barcode) {
    return NextResponse.json({ error: 'Invalid barcode' }, { status: 400 })
  }

  const linkCheck = await ensureLinkedDistributor(supabase, vendor.userId, distributorId)
  if (!linkCheck.ok) return NextResponse.json({ error: linkCheck.error }, { status: linkCheck.status })

  try {
    const productIds = await findProductIdsByBarcode(supabase, distributorId, barcode)
    if (productIds.length === 0) {
      return NextResponse.json({ ok: true, barcode, matches: [] })
    }

    const rpcMatches = await fetchMatchesViaRpc(supabase, distributorId, productIds)
    const matches = rpcMatches ?? await fetchMatchesFallback(supabase, distributorId, vendor.userId, productIds)

    return NextResponse.json({
      ok: true,
      barcode,
      matches: matches.slice(0, 10)
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to lookup barcode' }, { status: 500 })
  }
}
