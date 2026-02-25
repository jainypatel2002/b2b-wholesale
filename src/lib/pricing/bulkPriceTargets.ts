import type { PriceUnit } from './types'

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export const BULK_PRICE_FIELD_TARGETS = ['SELL_UNIT', 'SELL_CASE', 'COST', 'COST_UNIT', 'COST_CASE'] as const

export type BulkPriceFieldTarget = (typeof BULK_PRICE_FIELD_TARGETS)[number]
export type CanonicalBulkPriceFieldTarget = Exclude<BulkPriceFieldTarget, 'COST'>
export type LegacyBulkPriceField = 'sell_price' | 'price_case' | 'cost_price' | 'cost_case'

const LEGACY_TO_TARGET: Record<LegacyBulkPriceField, CanonicalBulkPriceFieldTarget> = {
  sell_price: 'SELL_UNIT',
  price_case: 'SELL_CASE',
  cost_price: 'COST_UNIT',
  cost_case: 'COST_CASE'
}

const TARGET_ALIASES: Record<string, BulkPriceFieldTarget | LegacyBulkPriceField> = {
  SELL_UNIT: 'SELL_UNIT',
  SELL_CASE: 'SELL_CASE',
  COST: 'COST',
  COST_UNIT: 'COST_UNIT',
  COST_CASE: 'COST_CASE',
  sell_price: 'sell_price',
  price_case: 'price_case',
  cost_price: 'cost_price',
  cost_case: 'cost_case',
  SELL_PRICE: 'sell_price',
  PRICE_CASE: 'price_case',
  COST_PRICE: 'cost_price'
}

export function normalizeBulkPriceFieldTarget(rawValue: unknown): ParseResult<CanonicalBulkPriceFieldTarget> {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return { ok: false, error: 'field target is required' }
  }

  const value = rawValue.trim()
  const aliased = TARGET_ALIASES[value] ?? TARGET_ALIASES[value.toUpperCase()]

  if (!aliased) {
    return { ok: false, error: `Invalid field target: ${value}` }
  }

  if (aliased === 'COST') {
    return { ok: true, value: 'COST_UNIT' }
  }

  if (aliased in LEGACY_TO_TARGET) {
    return { ok: true, value: LEGACY_TO_TARGET[aliased as LegacyBulkPriceField] }
  }

  return { ok: true, value: aliased as CanonicalBulkPriceFieldTarget }
}

export function resolveBulkPriceFieldTarget(input: {
  fieldTarget?: unknown
  field?: unknown
}): ParseResult<CanonicalBulkPriceFieldTarget> {
  if (input.fieldTarget !== undefined && input.fieldTarget !== null && input.fieldTarget !== '') {
    return normalizeBulkPriceFieldTarget(input.fieldTarget)
  }

  if (input.field !== undefined && input.field !== null && input.field !== '') {
    return normalizeBulkPriceFieldTarget(input.field)
  }

  return { ok: false, error: 'field target is required' }
}

export function getPriceUnitForBulkTarget(target: CanonicalBulkPriceFieldTarget): PriceUnit {
  return target === 'SELL_CASE' || target === 'COST_CASE' ? 'case' : 'unit'
}

export function toLegacyBulkPriceField(target: CanonicalBulkPriceFieldTarget): LegacyBulkPriceField {
  switch (target) {
    case 'SELL_UNIT':
      return 'sell_price'
    case 'SELL_CASE':
      return 'price_case'
    case 'COST_UNIT':
      return 'cost_price'
    case 'COST_CASE':
      return 'cost_case'
  }
}

