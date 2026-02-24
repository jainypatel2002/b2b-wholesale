const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

function isMissingFavoritesTableError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code === '42P01' || message.includes('vendor_favorites')
}

export async function getFavoriteProductIdsForVendor(params: {
  supabase: any
  vendorId: string
  distributorId?: string | null
}): Promise<string[]> {
  const { supabase, vendorId, distributorId } = params

  const favoritesResult = await supabase
    .from('vendor_favorites')
    .select('product_id')
    .eq('vendor_id', vendorId)

  if (favoritesResult.error) {
    if (isMissingFavoritesTableError(favoritesResult.error)) return []
    throw new Error(favoritesResult.error.message || 'Failed to load favorites')
  }

  const favoriteIds: string[] = Array.from(
    new Set<string>(
      (favoritesResult.data ?? [])
        .map((row: any) => String(row.product_id || ''))
        .filter((id: string) => isUuid(id))
    )
  )

  if (!distributorId || favoriteIds.length === 0) {
    return favoriteIds
  }

  let productsResult = await supabase
    .from('products')
    .select('id')
    .eq('distributor_id', distributorId)
    .in('id', favoriteIds)
    .is('deleted_at', null)

  if (productsResult.error && productsResult.error.code === '42703') {
    productsResult = await supabase
      .from('products')
      .select('id')
      .eq('distributor_id', distributorId)
      .in('id', favoriteIds)
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message || 'Failed to scope favorites by distributor')
  }

  return (productsResult.data ?? [])
    .map((row: any) => String(row.id || ''))
    .filter((id: string) => isUuid(id))
}
