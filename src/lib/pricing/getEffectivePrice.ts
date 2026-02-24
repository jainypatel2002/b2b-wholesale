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

function pickPriceByUnit(layer: { unit: number | null; case: number | null }, unit: PriceUnit): number | null {
  return unit === 'unit' ? layer.unit : layer.case
}

function roundEquivalent(value: number): number {
  return Math.round(value * 10000) / 10000
}

export function computeEquivalentUnit(casePrice: number, unitsPerCase: number): number | null {
  if (!Number.isFinite(casePrice) || !Number.isFinite(unitsPerCase) || unitsPerCase < 1) return null
  return roundEquivalent(casePrice / unitsPerCase)
}

export function computeEquivalentCase(unitPrice: number, unitsPerCase: number): number | null {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(unitsPerCase) || unitsPerCase < 1) return null
  return roundEquivalent(unitPrice * unitsPerCase)
}

export function resolveEffectivePrice(input: ResolveEffectivePriceInput): EffectivePriceResult {
  const product = normalizeProduct(input.product)
  const vendor = normalizeLayer(input.vendorOverride, 'vendorOverride')
  const bulk = normalizeLayer(input.bulkOverride, 'bulkOverride')

  const vendorPrice = pickPriceByUnit(vendor, input.priceUnit)
  if (vendorPrice !== null) return { price: vendorPrice, source: 'vendor_override' }

  const bulkPrice = pickPriceByUnit(bulk, input.priceUnit)
  if (bulkPrice !== null) return { price: bulkPrice, source: 'bulk_override' }

  const basePrice = pickPriceByUnit(product, input.priceUnit)
  if (basePrice !== null) return { price: basePrice, source: 'product_default' }

  return { price: null, source: null }
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
