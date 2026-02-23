export type UnitType = 'piece' | 'case'

export type PriceSource = 'vendor_override' | 'bulk_override' | 'product_default' | null

export type PriceLayer = {
  price_per_unit?: unknown
  price_per_case?: unknown
  price_cents?: unknown
}

export type PriceProduct = {
  sell_per_unit?: unknown
  sell_per_case?: unknown
  sell_price?: unknown
  price_case?: unknown
  units_per_case?: unknown
}

export type EffectivePriceInput = {
  product: PriceProduct
  vendorOverride?: PriceLayer | null
  bulkOverride?: PriceLayer | null
  unitType: UnitType
}

export type EffectivePriceResult = {
  price: number | null
  source: PriceSource
}

const DEV = process.env.NODE_ENV !== 'production'

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === '' || value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) {
    if (DEV) console.error(`[pricing] Invalid number for ${field}:`, value)
    return null
  }
  return n
}

function normalizeLayer(layer: PriceLayer | null | undefined, label: string): { unit: number | null; case: number | null } {
  if (!layer) return { unit: null, case: null }

  const directUnit = parseNullableNumber(layer.price_per_unit, `${label}.price_per_unit`)
  const cents = parseNullableNumber(layer.price_cents, `${label}.price_cents`)
  const unitFromCents = cents === null ? null : cents / 100

  return {
    unit: directUnit ?? unitFromCents,
    case: parseNullableNumber(layer.price_per_case, `${label}.price_per_case`)
  }
}

function normalizeProduct(product: PriceProduct): { unit: number | null; case: number | null; unitsPerCase: number } {
  const unitsPerCaseRaw = parseNullableNumber(product.units_per_case, 'product.units_per_case')
  const unitsPerCase = unitsPerCaseRaw && unitsPerCaseRaw > 0 ? Math.floor(unitsPerCaseRaw) : 1

  return {
    unit: parseNullableNumber(product.sell_per_unit, 'product.sell_per_unit')
      ?? parseNullableNumber(product.sell_price, 'product.sell_price'),
    case: parseNullableNumber(product.sell_per_case, 'product.sell_per_case')
      ?? parseNullableNumber(product.price_case, 'product.price_case'),
    unitsPerCase
  }
}

function resolveLayerPrice(
  layer: { unit: number | null; case: number | null },
  unitType: UnitType,
  unitsPerCase: number
): number | null {
  if (unitType === 'piece') {
    if (layer.unit !== null) return layer.unit
    if (layer.case !== null && unitsPerCase > 0) return layer.case / unitsPerCase
    return null
  }

  if (layer.case !== null) return layer.case
  if (layer.unit !== null && unitsPerCase > 0) return layer.unit * unitsPerCase
  return null
}

export function getEffectivePrice(input: EffectivePriceInput): EffectivePriceResult {
  const product = normalizeProduct(input.product)
  const vendor = normalizeLayer(input.vendorOverride, 'vendorOverride')
  const bulk = normalizeLayer(input.bulkOverride, 'bulkOverride')

  const vendorPrice = resolveLayerPrice(vendor, input.unitType, product.unitsPerCase)
  if (vendorPrice !== null) return { price: vendorPrice, source: 'vendor_override' }

  const bulkPrice = resolveLayerPrice(bulk, input.unitType, product.unitsPerCase)
  if (bulkPrice !== null) return { price: bulkPrice, source: 'bulk_override' }

  const basePrice = resolveLayerPrice(product, input.unitType, product.unitsPerCase)
  if (basePrice !== null) return { price: basePrice, source: 'product_default' }

  return { price: null, source: null }
}

