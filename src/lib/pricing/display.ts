type NullableNumber = number | null

function toFiniteNumber(value: unknown): NullableNumber {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function moneyRound(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function formatMoney(value: number | null | undefined, decimals = 2): string {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return `$${(0).toFixed(decimals)}`
  return `$${moneyRound(parsed, decimals).toFixed(decimals)}`
}

export function safeUnitsPerCase(unitsPerCase: unknown): number | null {
  const parsed = toFiniteNumber(unitsPerCase)
  if (parsed === null || parsed <= 0 || !Number.isInteger(parsed)) return null
  return parsed
}

export function toUnitFromCase(
  casePrice: number | null | undefined,
  unitsPerCase: number | null | undefined,
  precision = 4
): NullableNumber {
  const parsedCasePrice = toFiniteNumber(casePrice)
  const validUnitsPerCase = safeUnitsPerCase(unitsPerCase)
  if (parsedCasePrice === null || validUnitsPerCase === null) return null
  return moneyRound(parsedCasePrice / validUnitsPerCase, precision)
}

export function toCaseFromUnit(
  unitPrice: number | null | undefined,
  unitsPerCase: number | null | undefined,
  precision = 4
): NullableNumber {
  const parsedUnitPrice = toFiniteNumber(unitPrice)
  const validUnitsPerCase = safeUnitsPerCase(unitsPerCase)
  if (parsedUnitPrice === null || validUnitsPerCase === null) return null
  return moneyRound(parsedUnitPrice * validUnitsPerCase, precision)
}

export function computeUnitPrice(
  casePrice: number | null | undefined,
  unitsPerCase: number | null | undefined
): NullableNumber {
  return toUnitFromCase(casePrice, unitsPerCase, 4)
}

export function computeCasePrice(
  unitPrice: number | null | undefined,
  unitsPerCase: number | null | undefined
): NullableNumber {
  return toCaseFromUnit(unitPrice, unitsPerCase, 4)
}

export function resolveCaseUnitPrices(input: {
  casePrice: unknown
  unitPrice: unknown
  unitsPerCase: unknown
  precision?: number
}): { casePrice: NullableNumber; unitPrice: NullableNumber } {
  const unitsPerCase = safeUnitsPerCase(input.unitsPerCase)
  const storedCasePrice = toFiniteNumber(input.casePrice)
  const storedUnitPrice = toFiniteNumber(input.unitPrice)
  const precision = Number.isInteger(input.precision) ? Math.max(0, Number(input.precision)) : 4

  if (storedCasePrice !== null && storedUnitPrice !== null) {
    return { casePrice: storedCasePrice, unitPrice: storedUnitPrice }
  }

  if (storedCasePrice !== null) {
    return {
      casePrice: storedCasePrice,
      unitPrice: toUnitFromCase(storedCasePrice, unitsPerCase, precision)
    }
  }

  if (storedUnitPrice !== null) {
    return {
      casePrice: toCaseFromUnit(storedUnitPrice, unitsPerCase, precision),
      unitPrice: storedUnitPrice
    }
  }

  return { casePrice: null, unitPrice: null }
}
