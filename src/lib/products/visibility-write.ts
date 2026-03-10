import {
  bulkProductVisibilityRequiresVendorSelection,
  createEmptyBulkProductVisibilitySummary,
  normalizeUuidIds,
  type BulkProductVisibilityOperation,
  type BulkProductVisibilitySummary,
} from './visibility'

type ProductVisibilitySupabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => any
}

export type VisibleVendorValidationResult =
  | { ok: true; vendorIds: string[] }
  | { ok: false; error: string; invalidVendorIdsCount: number }

export type BulkProductVisibilityExecutionResult =
  | { ok: true; summary: BulkProductVisibilitySummary }
  | { ok: false; error: string; summary: BulkProductVisibilitySummary }

export function isMissingProductVisibilitySchemaError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return (
    code === '42703'
    || code === '42p01'
    || code === 'pgrst205'
    || message.includes('is_visible_to_vendors')
    || message.includes('vendor_visibility_scope')
    || message.includes('product_vendor_visibility')
    || message.includes('bulk_update_product_visibility')
  )
}

export async function validateVisibleVendorIds(params: {
  supabase: ProductVisibilitySupabaseClient
  distributorId: string
  vendorIds: string[]
}): Promise<VisibleVendorValidationResult> {
  const { supabase, distributorId } = params
  const vendorIds = normalizeUuidIds(params.vendorIds)

  if (vendorIds.length === 0) {
    return { ok: true, vendorIds: [] }
  }

  const { data, error } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('distributor_id', distributorId)
    .in('vendor_id', vendorIds)

  if (error) {
    return {
      ok: false,
      error: error.message || 'Unable to validate vendor visibility selections.',
      invalidVendorIdsCount: 0,
    }
  }

  const linkedVendorIds = new Set(
    (data ?? []).map((row: any) => String(row.vendor_id || '')).filter(Boolean)
  )

  const invalidVendorIds = vendorIds.filter((vendorId) => !linkedVendorIds.has(vendorId))
  if (invalidVendorIds.length > 0) {
    return {
      ok: false,
      error: 'Only vendors linked to this distributor can be selected for product visibility.',
      invalidVendorIdsCount: invalidVendorIds.length,
    }
  }

  return { ok: true, vendorIds }
}

export async function syncProductVendorVisibility(params: {
  supabase: ProductVisibilitySupabaseClient
  distributorId: string
  productId: string
  vendorIds: string[]
}) {
  const { supabase, distributorId, productId } = params
  const vendorIds = normalizeUuidIds(params.vendorIds)

  const deleteResult = await supabase
    .from('product_vendor_visibility')
    .delete()
    .eq('distributor_id', distributorId)
    .eq('product_id', productId)

  if (deleteResult.error) {
    if (isMissingProductVisibilitySchemaError(deleteResult.error)) {
      throw new Error('Apply migration 20260323000002_product_visibility_control.sql before editing product visibility.')
    }
    throw new Error(deleteResult.error.message || 'Failed to clear vendor visibility selections.')
  }

  if (vendorIds.length === 0) {
    return
  }

  const upsertResult = await supabase
    .from('product_vendor_visibility')
    .upsert(
      vendorIds.map((vendorId) => ({
        distributor_id: distributorId,
        vendor_id: vendorId,
        product_id: productId,
      })),
      { onConflict: 'distributor_id,vendor_id,product_id' }
    )

  if (upsertResult.error) {
    if (isMissingProductVisibilitySchemaError(upsertResult.error)) {
      throw new Error('Apply migration 20260323000002_product_visibility_control.sql before editing product visibility.')
    }
    throw new Error(upsertResult.error.message || 'Failed to save vendor visibility selections.')
  }
}

function toCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function coerceBulkProductVisibilitySummary(
  data: any,
  totalSelected: number
): BulkProductVisibilitySummary {
  const summary = createEmptyBulkProductVisibilitySummary(totalSelected)
  if (!data || typeof data !== 'object') return summary

  return {
    totalSelected: toCount(data.total_selected) || totalSelected,
    updatedCount: toCount(data.updated_count),
    skippedCount: toCount(data.skipped_count),
    invalidProductIdsCount: toCount(data.invalid_product_ids_count),
    invalidVendorIdsCount: toCount(data.invalid_vendor_ids_count),
  }
}

export async function executeBulkProductVisibility(params: {
  supabase: ProductVisibilitySupabaseClient
  distributorId: string
  productIds: string[]
  operation: BulkProductVisibilityOperation
  vendorIds?: string[] | null
}): Promise<BulkProductVisibilityExecutionResult> {
  const { supabase, distributorId, operation } = params
  const productIds = normalizeUuidIds(params.productIds)
  const totalSelected = productIds.length
  const summary = createEmptyBulkProductVisibilitySummary(totalSelected)

  if (productIds.length === 0) {
    return {
      ok: false,
      error: 'Select at least one product.',
      summary,
    }
  }

  let vendorIds: string[] | null = null
  if (bulkProductVisibilityRequiresVendorSelection(operation)) {
    const validation = await validateVisibleVendorIds({
      supabase,
      distributorId,
      vendorIds: params.vendorIds ?? [],
    })

    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        summary: {
          ...summary,
          invalidVendorIdsCount: validation.invalidVendorIdsCount,
        },
      }
    }

    if (validation.vendorIds.length === 0) {
      return {
        ok: false,
        error: 'Select at least one linked vendor.',
        summary,
      }
    }

    vendorIds = validation.vendorIds
  }

  const { data, error } = await supabase.rpc('bulk_update_product_visibility', {
    p_distributor_id: distributorId,
    p_product_ids: productIds,
    p_operation: operation,
    p_vendor_ids: vendorIds,
  })

  if (error) {
    if (error.code === 'PGRST202' || isMissingProductVisibilitySchemaError(error)) {
      return {
        ok: false,
        error: 'The bulk visibility function is missing. Apply migration 20260323000003_bulk_product_visibility.sql in Supabase SQL Editor.',
        summary,
      }
    }

    return {
      ok: false,
      error: error.message || 'Failed to update product visibility.',
      summary,
    }
  }

  const nextSummary = coerceBulkProductVisibilitySummary(data, totalSelected)
  if (data?.error) {
    return {
      ok: false,
      error: String(data.error || 'Failed to update product visibility.'),
      summary: nextSummary,
    }
  }

  return {
    ok: true,
    summary: nextSummary,
  }
}
