const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const VENDOR_VISIBILITY_SCOPES = ['all', 'selected'] as const
export const BULK_PRODUCT_VISIBILITY_OPERATIONS = [
  'set_visible',
  'set_hidden',
  'set_scope_all',
  'set_selected_vendors',
] as const

export type VendorVisibilityScope = (typeof VENDOR_VISIBILITY_SCOPES)[number]
export type BulkProductVisibilityOperation = (typeof BULK_PRODUCT_VISIBILITY_OPERATIONS)[number]

export type ProductVisibilitySummary = {
  label: string
  tone: 'default' | 'warning' | 'danger'
}

export type BulkProductVisibilitySummary = {
  totalSelected: number
  updatedCount: number
  skippedCount: number
  invalidProductIdsCount: number
  invalidVendorIdsCount: number
}

export function normalizeVendorVisibilityScope(value: unknown): VendorVisibilityScope {
  return value === 'selected' ? 'selected' : 'all'
}

export function normalizeUuidIds(values: unknown): string[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const ids: string[] = []

  for (const value of values) {
    const id = typeof value === 'string' ? value.trim() : ''
    if (!UUID_REGEX.test(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

export function normalizeVisibleVendorIds(values: unknown): string[] {
  return normalizeUuidIds(values)
}

export function normalizeBulkProductVisibilityOperation(value: unknown): BulkProductVisibilityOperation | null {
  return BULK_PRODUCT_VISIBILITY_OPERATIONS.includes(value as BulkProductVisibilityOperation)
    ? (value as BulkProductVisibilityOperation)
    : null
}

export function bulkProductVisibilityRequiresVendorSelection(operation: BulkProductVisibilityOperation): boolean {
  return operation === 'set_selected_vendors'
}

export function createEmptyBulkProductVisibilitySummary(totalSelected = 0): BulkProductVisibilitySummary {
  return {
    totalSelected,
    updatedCount: 0,
    skippedCount: 0,
    invalidProductIdsCount: 0,
    invalidVendorIdsCount: 0,
  }
}

export function getBulkProductVisibilityActionLabel(operation: BulkProductVisibilityOperation): string {
  switch (operation) {
    case 'set_visible':
      return 'Made visible to vendors'
    case 'set_hidden':
      return 'Hidden from vendors'
    case 'set_scope_all':
      return 'Set to all linked vendors'
    case 'set_selected_vendors':
      return 'Updated selected-vendor visibility'
  }
}

export function getBulkProductVisibilitySuccessMessage(
  operation: BulkProductVisibilityOperation,
  summary: BulkProductVisibilitySummary
): string {
  if (summary.updatedCount === 0) {
    if (summary.invalidProductIdsCount >= summary.totalSelected && summary.totalSelected > 0) {
      return 'No selected products were available to update.'
    }

    return `No visibility changes were needed for ${summary.totalSelected} product${summary.totalSelected === 1 ? '' : 's'}.`
  }

  let message = `${getBulkProductVisibilityActionLabel(operation)} for ${summary.updatedCount} product${summary.updatedCount === 1 ? '' : 's'}.`

  if (summary.skippedCount > 0) {
    message += ` ${summary.skippedCount} already matched.`
  }

  if (summary.invalidProductIdsCount > 0) {
    message += ` ${summary.invalidProductIdsCount} unavailable skipped.`
  }

  return message
}

export function getProductVisibilitySummary(params: {
  isVisibleToVendors: boolean
  vendorVisibilityScope: VendorVisibilityScope
  selectedVendorCount: number
  linkedVendorCount?: number
}): ProductVisibilitySummary {
  const {
    isVisibleToVendors,
    vendorVisibilityScope,
    selectedVendorCount,
    linkedVendorCount = 0,
  } = params

  if (!isVisibleToVendors) {
    return {
      label: 'Hidden from vendors',
      tone: 'danger',
    }
  }

  if (vendorVisibilityScope === 'selected') {
    if (selectedVendorCount < 1) {
      return {
        label: 'Hidden until vendors are selected',
        tone: 'warning',
      }
    }

    return {
      label: `${selectedVendorCount} vendor${selectedVendorCount === 1 ? '' : 's'} selected`,
      tone: 'warning',
    }
  }

  if (linkedVendorCount > 0) {
    return {
      label: `Visible to all vendors (${linkedVendorCount})`,
      tone: 'default',
    }
  }

  return {
    label: 'Visible to all vendors',
    tone: 'default',
  }
}

export function productIsHiddenForVendors(params: {
  isVisibleToVendors: boolean
  vendorVisibilityScope: VendorVisibilityScope
  selectedVendorCount: number
}): boolean {
  const { isVisibleToVendors, vendorVisibilityScope, selectedVendorCount } = params

  if (!isVisibleToVendors) return true
  if (vendorVisibilityScope !== 'selected') return false
  return selectedVendorCount < 1
}
