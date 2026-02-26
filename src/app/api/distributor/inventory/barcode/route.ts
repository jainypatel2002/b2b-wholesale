import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { resolveProductByBarcode } from '@/lib/barcodes/resolver'
import { normalizeBarcode } from '@/lib/utils/barcode'

type DistributorInventoryProduct = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  cost_price: number | null
  sell_price: number | null
  cost_per_unit: number | null
  sell_per_unit: number | null
  cost_case: number | null
  price_case: number | null
  cost_per_case: number | null
  sell_per_case: number | null
  stock_qty: number
  stock_pieces: number
  allow_case: boolean
  allow_piece: boolean
  units_per_case: number
  low_stock_threshold: number
  category_id: string | null
  category_node_id: string | null
  cost_mode: 'unit' | 'case'
  price_mode: 'unit' | 'case'
  stock_mode: 'pieces' | 'cases'
  stock_locked?: boolean
  locked_stock_qty?: number | null
  categories?: { name: string } | null
  category_nodes?: { name: string } | null
  barcodes: Array<{
    id: string
    barcode: string
    is_primary: boolean
    created_at?: string
  }>
}

async function requireDistributorUser(supabase: any) {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Unauthorized', status: 401 as const }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id,role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (error) return { error: error.message, status: 400 as const }
  if (!profile || profile.role !== 'distributor') return { error: 'Forbidden', status: 403 as const }

  return { distributorId: auth.user.id }
}

function formatProduct(row: any): DistributorInventoryProduct {
  const barcodes = (
    Array.isArray(row.product_barcodes) && row.product_barcodes.length > 0
      ? row.product_barcodes
      : (row.barcode ? [{ id: `legacy-${row.id}`, barcode: row.barcode, is_primary: true }] : [])
  )
    .map((entry: any) => ({
      id: String(entry.id || ''),
      barcode: String(entry.barcode || ''),
      is_primary: entry.is_primary !== false,
      created_at: entry.created_at ? String(entry.created_at) : undefined
    }))
    .filter((entry: any) => entry.id && entry.barcode)
    .sort((a: any, b: any) => {
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return a.barcode.localeCompare(b.barcode)
    })

  return {
    id: String(row.id),
    name: String(row.name || ''),
    sku: row.sku == null ? null : String(row.sku),
    barcode: row.barcode == null ? null : String(row.barcode),
    cost_price: row.cost_price == null ? null : Number(row.cost_price),
    sell_price: row.sell_price == null ? null : Number(row.sell_price),
    cost_per_unit: row.cost_per_unit == null ? null : Number(row.cost_per_unit),
    sell_per_unit: row.sell_per_unit == null ? null : Number(row.sell_per_unit),
    cost_case: row.cost_case == null ? null : Number(row.cost_case),
    price_case: row.price_case == null ? null : Number(row.price_case),
    cost_per_case: row.cost_per_case == null ? null : Number(row.cost_per_case),
    sell_per_case: row.sell_per_case == null ? null : Number(row.sell_per_case),
    stock_qty: Number(row.stock_qty || 0),
    stock_pieces: Number(row.stock_pieces ?? row.stock_qty ?? 0),
    allow_case: row.allow_case !== false,
    allow_piece: row.allow_piece !== false,
    units_per_case: Math.max(1, Math.floor(Number(row.units_per_case || 1))),
    low_stock_threshold: Number(row.low_stock_threshold || 5),
    category_id: row.category_id == null ? null : String(row.category_id),
    category_node_id: row.category_node_id == null ? null : String(row.category_node_id),
    cost_mode: row.cost_mode === 'case' ? 'case' : 'unit',
    price_mode: row.price_mode === 'case' ? 'case' : 'unit',
    stock_mode: row.stock_mode === 'cases' ? 'cases' : 'pieces',
    stock_locked: row.stock_locked === true,
    locked_stock_qty: row.locked_stock_qty == null ? null : Number(row.locked_stock_qty),
    categories: Array.isArray(row.categories) ? row.categories[0] : row.categories,
    category_nodes: Array.isArray(row.category_nodes) ? row.category_nodes[0] : row.category_nodes,
    barcodes
  }
}

async function fetchInventoryProductById(
  supabase: any,
  distributorId: string,
  productId: string
): Promise<DistributorInventoryProduct | null> {
  const selectWithBarcodes = 'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,category_id,category_node_id,cost_mode,price_mode,stock_mode,stock_locked,locked_stock_qty,product_barcodes(id,barcode,is_primary,created_at),categories(name),category_nodes(name)'
  const selectWithoutBarcodes = 'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,category_id,category_node_id,cost_mode,price_mode,stock_mode,stock_locked,locked_stock_qty,categories(name),category_nodes(name)'
  const selectLegacyFallback = 'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,category_id,category_node_id,cost_mode,price_mode,stock_mode,categories(name),category_nodes(name)'

  let result = await supabase
    .from('products')
    .select(selectWithBarcodes)
    .eq('distributor_id', distributorId)
    .eq('id', productId)
    .is('deleted_at', null)
    .maybeSingle()

  if (result.error) {
    const message = String(result.error.message || '')

    if (result.error.code === '42703') {
      result = await supabase
        .from('products')
        .select(selectLegacyFallback)
        .eq('distributor_id', distributorId)
        .eq('id', productId)
        .maybeSingle()
    } else if (message.includes('product_barcodes') || message.includes('schema cache')) {
      result = await supabase
        .from('products')
        .select(selectWithoutBarcodes)
        .eq('distributor_id', distributorId)
        .eq('id', productId)
        .is('deleted_at', null)
        .maybeSingle()
    }
  }

  if (result.error || !result.data) return null
  return formatProduct(result.data)
}

export async function GET(request: NextRequest) {
  const { supabase } = createRouteClient(request)
  const distributor = await requireDistributorUser(supabase)
  if ('error' in distributor) {
    return NextResponse.json({ error: distributor.error }, { status: distributor.status })
  }

  const rawBarcode = String(request.nextUrl.searchParams.get('barcode') || '')
  const barcode = normalizeBarcode(rawBarcode)

  if (!barcode || barcode.length < 6) {
    return NextResponse.json({ error: 'Invalid barcode' }, { status: 400 })
  }

  try {
    const resolved = await resolveProductByBarcode({
      supabase,
      distributorId: distributor.distributorId,
      barcode,
      viewerRole: 'distributor'
    })

    if (!resolved) {
      return NextResponse.json({ ok: true, barcode, product: null })
    }

    const productId = String(resolved.product?.id || '')
    const product = await fetchInventoryProductById(supabase, distributor.distributorId, productId)
      ?? {
        id: productId,
        name: String(resolved.product?.name || 'Unknown product'),
        sku: null,
        barcode: resolved.normalizedBarcode,
        cost_price: null,
        sell_price: null,
        cost_per_unit: null,
        sell_per_unit: null,
        cost_case: null,
        price_case: null,
        cost_per_case: null,
        sell_per_case: null,
        stock_qty: 0,
        stock_pieces: 0,
        allow_case: true,
        allow_piece: true,
        units_per_case: 1,
        low_stock_threshold: 5,
        category_id: null,
        category_node_id: null,
        cost_mode: 'unit' as const,
        price_mode: 'unit' as const,
        stock_mode: 'pieces' as const,
        stock_locked: false,
        locked_stock_qty: null,
        categories: null,
        category_nodes: null,
        barcodes: resolved.matchedBarcode
          ? [{ ...resolved.matchedBarcode }]
          : [{ id: `legacy-${productId}`, barcode: resolved.normalizedBarcode, is_primary: true }]
      }

    return NextResponse.json({
      ok: true,
      barcode: resolved.normalizedBarcode,
      product,
      matchedBarcode: resolved.matchedBarcode,
      source: resolved.source
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to resolve barcode' },
      { status: 500 }
    )
  }
}
