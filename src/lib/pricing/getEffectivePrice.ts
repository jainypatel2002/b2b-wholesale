import type { PriceUnit } from './types'

export type UnitType = 'piece' | 'case'

export type PriceSource = 'vendor_override' | 'bulk_override' | 'product_default' | null

export type PriceLayer = {
  price_per_unit?: unknown
  price_per_case?: unknown
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

export type EffectivePricesInput = Omit<EffectivePriceInput, 'unitType'>

export type ResolveEffectivePriceInput = Omit<EffectivePriceInput, 'unitType'> & {
  priceUnit: PriceUnit
}

export type EffectivePriceResult = {
  price: number | null
  source: PriceSource
}

export type RequiredEffectivePriceResult = {
  price: number
  source: Exclude<PriceSource, null>
}

export type EffectivePricesResult = {
  effective_unit_price: number | null
  effective_case_price: number | null
  units_per_case: number
  unit_source: PriceSource
  case_source: PriceSource
  unit_display: string | null
  case_display: string | null
}

export class MissingEffectivePriceError extends Error {
  readonly unitType: UnitType

  constructor(unitType: UnitType) {
    const message =
      unitType === 'case'
        ? 'Set case price in inventory before ordering by case.'
        : 'Set unit price in inventory before ordering by unit.'

    super(message)
    this.name = 'MissingEffectivePriceError'
    this.unitType = unitType
  }
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

  return {
    unit: parseNullableNumber(layer.price_per_unit, `${label}.price_per_unit`),
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

function toPriceUnit(unitType: UnitType): PriceUnit {
  return unitType === 'case' ? 'case' : 'unit'
}

function roundEquivalent(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function computeEquivalentUnit(casePrice: number, unitsPerCase: number): number | null {
  if (!Number.isFinite(casePrice) || !Number.isFinite(unitsPerCase) || unitsPerCase < 1) return null
  return roundEquivalent(casePrice / unitsPerCase)
}

export function computeEquivalentCase(unitPrice: number, unitsPerCase: number): number | null {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(unitsPerCase) || unitsPerCase < 1) return null
  return roundEquivalent(unitPrice * unitsPerCase)
}

function deriveMissingPrices(
  layer: { unit: number | null; case: number | null },
  unitsPerCase: number,
  options: { deriveUnitFromCase: boolean; deriveCaseFromUnit: boolean }
): { unit: number | null; case: number | null } {
  const unit = layer.unit ?? (
    options.deriveUnitFromCase && layer.case !== null
      ? computeEquivalentUnit(layer.case, unitsPerCase)
      : null
  )
  const casePrice = layer.case ?? (
    options.deriveCaseFromUnit && layer.unit !== null
      ? computeEquivalentCase(layer.unit, unitsPerCase)
      : null
  )
  return { unit, case: casePrice }
}

function toDisplayPrice(value: number | null): string | null {
  if (value === null) return null
  return value.toFixed(2)
}

function pickFirstPrice(
  vendorPrice: number | null,
  bulkPrice: number | null,
  basePrice: number | null
): EffectivePriceResult {
  if (vendorPrice !== null) return { price: vendorPrice, source: 'vendor_override' }
  if (bulkPrice !== null) return { price: bulkPrice, source: 'bulk_override' }
  if (basePrice !== null) return { price: basePrice, source: 'product_default' }
  return { price: null, source: null }
}

export function getEffectivePrices(input: EffectivePricesInput): EffectivePricesResult {
  const product = normalizeProduct(input.product)
  const vendorLayer = normalizeLayer(input.vendorOverride, 'vendorOverride')
  const bulkLayer = normalizeLayer(input.bulkOverride, 'bulkOverride')

  const vendor = deriveMissingPrices(vendorLayer, product.unitsPerCase, {
    deriveUnitFromCase: true,
    deriveCaseFromUnit: false
  })
  const bulk = deriveMissingPrices(bulkLayer, product.unitsPerCase, {
    deriveUnitFromCase: true,
    deriveCaseFromUnit: false
  })
  const base = deriveMissingPrices(product, product.unitsPerCase, {
    deriveUnitFromCase: true,
    deriveCaseFromUnit: true
  })

  const unit = pickFirstPrice(vendor.unit, bulk.unit, base.unit)
  const casePrice = pickFirstPrice(vendor.case, bulk.case, base.case)

  return {
    effective_unit_price: unit.price,
    effective_case_price: casePrice.price,
    units_per_case: product.unitsPerCase,
    unit_source: unit.source,
    case_source: casePrice.source,
    unit_display: toDisplayPrice(unit.price),
    case_display: toDisplayPrice(casePrice.price)
  }
}

export function resolveEffectivePrice(input: ResolveEffectivePriceInput): EffectivePriceResult {
  const effective = getEffectivePrices({
    product: input.product,
    vendorOverride: input.vendorOverride,
    bulkOverride: input.bulkOverride
  })

  if (input.priceUnit === 'unit') {
    return { price: effective.effective_unit_price, source: effective.unit_source }
  }

  return { price: effective.effective_case_price, source: effective.case_source }
}

export function getEffectivePrice(input: EffectivePriceInput): EffectivePriceResult {
  return resolveEffectivePrice({
    product: input.product,
    vendorOverride: input.vendorOverride,
    bulkOverride: input.bulkOverride,
    priceUnit: toPriceUnit(input.unitType)
  })
}

export function getRequiredEffectivePrice(input: EffectivePriceInput): RequiredEffectivePriceResult {
  const result = getEffectivePrice(input)

  if (result.price === null) {
    throw new MissingEffectivePriceError(input.unitType)
  }

  return {
    price: result.price,
    source: result.source as Exclude<PriceSource, null>
  }
}
