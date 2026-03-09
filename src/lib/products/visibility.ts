const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const VENDOR_VISIBILITY_SCOPES = ['all', 'selected'] as const

export type VendorVisibilityScope = (typeof VENDOR_VISIBILITY_SCOPES)[number]

export type ProductVisibilitySummary = {
  label: string
  tone: 'default' | 'warning' | 'danger'
}

export function normalizeVendorVisibilityScope(value: unknown): VendorVisibilityScope {
  return value === 'selected' ? 'selected' : 'all'
}

export function normalizeVisibleVendorIds(values: unknown): string[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const vendorIds: string[] = []

  for (const value of values) {
    const vendorId = typeof value === 'string' ? value.trim() : ''
    if (!UUID_REGEX.test(vendorId) || seen.has(vendorId)) continue
    seen.add(vendorId)
    vendorIds.push(vendorId)
  }

  return vendorIds
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
