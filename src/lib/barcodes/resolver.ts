import { isUuid } from '@/lib/vendor/favorites'
import { normalizeBarcode } from '@/lib/utils/barcode'

export type BarcodeViewerRole = 'distributor' | 'vendor'

export type BarcodeMappingRow = {
  id: string
  product_id: string
  distributor_id: string
  barcode: string
  is_primary: boolean
  created_at?: string
}

export type ResolvedProductByBarcode = {
  product: any
  matchedBarcode: BarcodeMappingRow | null
  normalizedBarcode: string
  source: 'product_barcodes' | 'products.barcode'
}

function isMissingProductBarcodeTableError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return (
    code === '42P01'
    || code === 'PGRST205'
    || (message.includes('product_barcodes') && message.includes('does not exist'))
    || (message.includes('schema cache') && message.includes('product_barcodes'))
  )
}

function isMissingDeletedAtOrIsActiveColumns(error: any): boolean {
  return String(error?.code || '') === '42703'
}

function isProductActive(row: any): boolean {
  const active = row?.is_active == null ? row?.active !== false : row?.is_active !== false
  const notDeleted = row?.deleted_at == null
  return active && notDeleted
}

async function isVendorLinkedToDistributor(
  supabase: any,
  vendorId: string,
  distributorId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('vendor_id', vendorId)
    .eq('distributor_id', distributorId)
    .limit(1)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}

async function findActiveProductById(
  supabase: any,
  distributorId: string,
  productId: string
): Promise<any | null> {
  let result = await supabase
    .from('products')
    .select('id,distributor_id,barcode,active,is_active,deleted_at')
    .eq('distributor_id', distributorId)
    .eq('id', productId)
    .maybeSingle()

  if (result.error && isMissingDeletedAtOrIsActiveColumns(result.error)) {
    result = await supabase
      .from('products')
      .select('id,distributor_id,barcode,active')
      .eq('distributor_id', distributorId)
      .eq('id', productId)
      .maybeSingle()
  }

  if (result.error || !result.data) return null
  return isProductActive(result.data) ? result.data : null
}

async function findActiveLegacyProductByBarcode(
  supabase: any,
  distributorId: string,
  barcode: string
): Promise<any | null> {
  const selectColumns = 'id,distributor_id,barcode,active,is_active,deleted_at'
  const legacySelectColumns = 'id,distributor_id,barcode,active'

  let result = await supabase
    .from('products')
    .select(selectColumns)
    .eq('distributor_id', distributorId)
    .eq('barcode', barcode)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (result.error && isMissingDeletedAtOrIsActiveColumns(result.error)) {
    result = await supabase
      .from('products')
      .select(legacySelectColumns)
      .eq('distributor_id', distributorId)
      .eq('barcode', barcode)
      .limit(1)
      .maybeSingle()
  }

  if (!result.error && !result.data) {
    let ilikeResult = await supabase
      .from('products')
      .select(selectColumns)
      .eq('distributor_id', distributorId)
      .ilike('barcode', barcode)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (ilikeResult.error && isMissingDeletedAtOrIsActiveColumns(ilikeResult.error)) {
      ilikeResult = await supabase
        .from('products')
        .select(legacySelectColumns)
        .eq('distributor_id', distributorId)
        .ilike('barcode', barcode)
        .limit(1)
        .maybeSingle()
    }

    if (!ilikeResult.error && ilikeResult.data) {
      result = ilikeResult
    }
  }

  if (result.error || !result.data) return null
  return isProductActive(result.data) ? result.data : null
}

async function getProductBarcodeCount(supabase: any, productId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('product_barcodes')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)

  if (error) {
    if (isMissingProductBarcodeTableError(error)) return null
    return null
  }

  return Number(count || 0)
}

async function insertLegacyBarcodeMappingIfNeeded(params: {
  supabase: any
  productId: string
  distributorId: string
  barcode: string
}): Promise<BarcodeMappingRow | null> {
  const { supabase, productId, distributorId, barcode } = params

  const barcodeCount = await getProductBarcodeCount(supabase, productId)
  if (barcodeCount == null || barcodeCount > 0) return null

  const { data, error } = await supabase
    .from('product_barcodes')
    .insert({
      product_id: productId,
      distributor_id: distributorId,
      barcode,
      is_primary: true
    })
    .select('id,product_id,distributor_id,barcode,is_primary,created_at')
    .maybeSingle()

  if (error) {
    const code = String(error?.code || '')
    if (code === '23505' || isMissingProductBarcodeTableError(error)) {
      return null
    }
    throw new Error(error.message || 'Failed to sync legacy barcode mapping')
  }

  return data ? {
    id: String(data.id),
    product_id: String(data.product_id),
    distributor_id: String(data.distributor_id),
    barcode: String(data.barcode),
    is_primary: data.is_primary !== false,
    created_at: data.created_at ? String(data.created_at) : undefined
  } : null
}

async function findMappingRow(
  supabase: any,
  distributorId: string,
  barcode: string
): Promise<BarcodeMappingRow | null> {
  const { data, error } = await supabase
    .from('product_barcodes')
    .select('id,product_id,distributor_id,barcode,is_primary,created_at')
    .eq('distributor_id', distributorId)
    .eq('barcode', barcode)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingProductBarcodeTableError(error)) return null
    throw new Error(error.message || 'Failed to resolve barcode mapping')
  }

  if (!data) return null

  return {
    id: String(data.id),
    product_id: String(data.product_id),
    distributor_id: String(data.distributor_id),
    barcode: String(data.barcode),
    is_primary: data.is_primary !== false,
    created_at: data.created_at ? String(data.created_at) : undefined
  }
}

export async function resolveProductByBarcode(params: {
  supabase: any
  distributorId: string
  barcode: string
  viewerRole: BarcodeViewerRole
  vendorId?: string
}): Promise<ResolvedProductByBarcode | null> {
  const { supabase, distributorId, barcode, viewerRole, vendorId } = params

  if (!isUuid(distributorId)) return null

  const normalizedBarcode = normalizeBarcode(barcode)
  if (!normalizedBarcode || normalizedBarcode.length < 6) return null

  if (viewerRole === 'vendor') {
    if (!vendorId || !isUuid(vendorId)) return null
    const linked = await isVendorLinkedToDistributor(supabase, vendorId, distributorId)
    if (!linked) {
      return null
    }
  }

  const mapping = await findMappingRow(supabase, distributorId, normalizedBarcode)
  if (mapping) {
    const mappedProduct = await findActiveProductById(supabase, distributorId, mapping.product_id)
    if (mappedProduct) {
      return {
        product: mappedProduct,
        matchedBarcode: mapping,
        normalizedBarcode,
        source: 'product_barcodes'
      }
    }
  }

  const legacyProduct = await findActiveLegacyProductByBarcode(supabase, distributorId, normalizedBarcode)
  if (!legacyProduct) return null

  const backfilled = viewerRole === 'distributor'
    ? await insertLegacyBarcodeMappingIfNeeded({
      supabase,
      productId: String(legacyProduct.id),
      distributorId,
      barcode: normalizedBarcode
    })
    : null

  return {
    product: legacyProduct,
    matchedBarcode: backfilled,
    normalizedBarcode,
    source: 'products.barcode'
  }
}
