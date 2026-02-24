import { isPriceUnit, type PriceUnit } from './types'

type ParseNumberOptions = {
  allowNegative?: boolean
  roundTo?: number
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function parseNumericInput(
  rawValue: unknown,
  label: string,
  options: ParseNumberOptions = {}
): ParseResult<number> {
  const { allowNegative = false, roundTo = 2 } = options

  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { ok: false, error: `${label} is required` }
  }

  const numberValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)
  if (!Number.isFinite(numberValue)) {
    return { ok: false, error: `${label} must be a valid number` }
  }

  if (!allowNegative && numberValue < 0) {
    return { ok: false, error: `${label} must be 0 or greater` }
  }

  return { ok: true, value: roundNumber(numberValue, roundTo) }
}

export function parsePriceUnit(rawValue: unknown, label = 'price_unit'): ParseResult<PriceUnit> {
  if (!isPriceUnit(rawValue)) {
    return { ok: false, error: `${label} must be "unit" or "case"` }
  }

  return { ok: true, value: rawValue }
}

