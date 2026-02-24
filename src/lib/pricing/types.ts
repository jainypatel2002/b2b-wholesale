export const PRICE_UNITS = ['unit', 'case'] as const

export type PriceUnit = (typeof PRICE_UNITS)[number]

export function isPriceUnit(value: unknown): value is PriceUnit {
  return typeof value === 'string' && (PRICE_UNITS as readonly string[]).includes(value)
}

