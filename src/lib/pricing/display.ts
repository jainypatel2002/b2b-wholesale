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

export function formatMoney(value: number | null | undefined): string {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return '$0.00'
  return `$${moneyRound(parsed, 2).toFixed(2)}`
}

export function computeUnitPrice(
  casePrice: number | null | undefined,
  unitsPerCase: number | null | undefined
): NullableNumber {
  const parsedCasePrice = toFiniteNumber(casePrice)
  const parsedUnitsPerCase = toFiniteNumber(unitsPerCase)
  if (parsedCasePrice === null || parsedUnitsPerCase === null || parsedUnitsPerCase <= 0) return null
  return moneyRound(parsedCasePrice / parsedUnitsPerCase, 2)
}

export function computeCasePrice(
  unitPrice: number | null | undefined,
  unitsPerCase: number | null | undefined
): NullableNumber {
  const parsedUnitPrice = toFiniteNumber(unitPrice)
  const parsedUnitsPerCase = toFiniteNumber(unitsPerCase)
  if (parsedUnitPrice === null || parsedUnitsPerCase === null || parsedUnitsPerCase <= 0) return null
  return moneyRound(parsedUnitPrice * parsedUnitsPerCase, 2)
}

export function resolveCaseUnitPrices(input: {
  casePrice: unknown
  unitPrice: unknown
  unitsPerCase: unknown
}): { casePrice: NullableNumber; unitPrice: NullableNumber } {
  const unitsPerCase = toFiniteNumber(input.unitsPerCase)
  const storedCasePrice = toFiniteNumber(input.casePrice)
  const storedUnitPrice = toFiniteNumber(input.unitPrice)

  const casePrice = storedCasePrice === null ? null : moneyRound(storedCasePrice, 2)
  let unitPrice = storedUnitPrice === null ? null : moneyRound(storedUnitPrice, 2)

  if (unitPrice === null && casePrice !== null) {
    unitPrice = computeUnitPrice(casePrice, unitsPerCase)
  }

  if (casePrice === null && unitPrice !== null) {
    return {
      casePrice: computeCasePrice(unitPrice, unitsPerCase),
      unitPrice
    }
  }

  return { casePrice, unitPrice }
}
