import { moneyRound, safeUnitsPerCase } from './display'
import { parseNumericInput } from './priceValidation'
import type { CanonicalBulkPriceFieldTarget } from './bulkPriceTargets'

export const BULK_EDITABLE_PRICE_FIELDS = [
  'sell_per_unit',
  'sell_per_case',
  'cost_per_unit',
  'cost_per_case'
] as const

export type BulkEditablePriceField = (typeof BULK_EDITABLE_PRICE_FIELDS)[number]
export type BulkRuleChangeType = 'percent' | 'fixed' | 'set'
export type BulkFieldSource = 'original' | 'bulk' | 'override'

export type BulkPricingValues = Record<BulkEditablePriceField, number | null>

export type BulkPricingProductRow = {
  id: string
  name: string
  allow_case: boolean
  units_per_case: number | null
} & BulkPricingValues

export type BulkPricingRule = {
  field: CanonicalBulkPriceFieldTarget
  changeType: BulkRuleChangeType
  value: number
  productIds: string[]
}

export type BulkPricingRowOverrideInput = Partial<Record<BulkEditablePriceField, string | number>>
export type BulkPricingRowOverrides = Record<string, BulkPricingRowOverrideInput>

export type BulkRuleValidationResult =
  | { ok: true }
  | {
      ok: false
      error: string
      invalidProductIds: string[]
      invalidProductNames: string[]
    }

export type ResolvedBulkPricingRow<T extends BulkPricingProductRow = BulkPricingProductRow> = T & {
  base: BulkPricingValues
  bulkPreview: Partial<BulkPricingValues>
  final: BulkPricingValues
  sources: Record<BulkEditablePriceField, BulkFieldSource>
  fieldErrors: Partial<Record<BulkEditablePriceField, string>>
  hasBulkChanges: boolean
  hasOverride: boolean
  overrideFields: BulkEditablePriceField[]
  changedFields: BulkEditablePriceField[]
  isTargetedByBulk: boolean
}

export type BulkPricingSaveRow = {
  productId: string
  final: BulkPricingValues
  changedFields: BulkEditablePriceField[]
  hasSellUnitChange: boolean
  hasSellCaseChange: boolean
  hasCostUnitChange: boolean
  hasCostCaseChange: boolean
}

const FIELD_LABELS: Record<BulkEditablePriceField, string> = {
  sell_per_unit: 'Sell price (per unit)',
  sell_per_case: 'Sell price (per case)',
  cost_per_unit: 'Cost price (per unit)',
  cost_per_case: 'Cost price (per case)'
}

function toFieldKey(target: CanonicalBulkPriceFieldTarget): BulkEditablePriceField {
  switch (target) {
    case 'SELL_UNIT':
      return 'sell_per_unit'
    case 'SELL_CASE':
      return 'sell_per_case'
    case 'COST_UNIT':
      return 'cost_per_unit'
    case 'COST_CASE':
      return 'cost_per_case'
  }
}

function toValues(row: BulkPricingProductRow): BulkPricingValues {
  return {
    sell_per_unit: row.sell_per_unit ?? null,
    sell_per_case: row.sell_per_case ?? null,
    cost_per_unit: row.cost_per_unit ?? null,
    cost_per_case: row.cost_per_case ?? null
  }
}

function deriveCostCaseFallback(row: BulkPricingProductRow): number | null {
  const validUnitsPerCase = safeUnitsPerCase(row.units_per_case)
  if (validUnitsPerCase === null || row.cost_per_unit === null) return null
  return moneyRound(row.cost_per_unit * validUnitsPerCase, 4)
}

function getBulkBaselineValue(row: BulkPricingProductRow, field: BulkEditablePriceField): number | null {
  if (field === 'cost_per_case') {
    return row.cost_per_case ?? deriveCostCaseFallback(row)
  }

  return row[field]
}

function computeBulkValue(currentValue: number, changeType: BulkRuleChangeType, rawValue: number): number {
  switch (changeType) {
    case 'percent':
      return moneyRound(currentValue * (1 + rawValue / 100), 4)
    case 'fixed':
      return moneyRound(currentValue + rawValue, 4)
    case 'set':
      return moneyRound(rawValue, 4)
  }
}

function getMissingBaselineError(field: BulkEditablePriceField): string {
  switch (field) {
    case 'sell_per_unit':
      return 'Cannot apply percent/fixed: some products have no unit sell price'
    case 'sell_per_case':
      return 'Cannot apply percent/fixed: some products have no case sell price'
    case 'cost_per_unit':
      return 'Cannot apply percent/fixed: some products have no unit cost'
    case 'cost_per_case':
      return 'Cannot apply percent/fixed: some products have no case cost'
  }
}

function getNegativeResultError(field: BulkEditablePriceField): string {
  switch (field) {
    case 'sell_per_unit':
      return 'Bulk update rejected: resulting sell prices would be negative'
    case 'sell_per_case':
      return 'Bulk update rejected: resulting case prices would be negative'
    case 'cost_per_unit':
      return 'Bulk update rejected: resulting costs would be negative'
    case 'cost_per_case':
      return 'Bulk update rejected: resulting case costs would be negative'
  }
}

function normalizeComparablePrice(value: number | null): number | null {
  return value === null ? null : moneyRound(value, 4)
}

export function areBulkPricesEqual(left: number | null, right: number | null): boolean {
  return normalizeComparablePrice(left) === normalizeComparablePrice(right)
}

function deriveSyncedUnitFromCase(casePrice: number | null, unitsPerCase: number | null): number | null {
  const validUnitsPerCase = safeUnitsPerCase(unitsPerCase)
  if (casePrice === null || validUnitsPerCase === null) return null
  // Mirrors the existing bulk pricing save path, which syncs case changes back to unit prices at 2 decimals.
  return moneyRound(casePrice / validUnitsPerCase, 2)
}

function parseOverrideInput(
  rawValue: string | number | undefined,
  field: BulkEditablePriceField
): { kind: 'empty' } | { kind: 'invalid'; error: string } | { kind: 'valid'; value: number } {
  if (rawValue === undefined || rawValue === '') {
    return { kind: 'empty' }
  }

  const parsed = parseNumericInput(rawValue, FIELD_LABELS[field], {
    allowNegative: false,
    roundTo: 4
  })

  if (!parsed.ok) {
    return { kind: 'invalid', error: parsed.error }
  }

  return { kind: 'valid', value: parsed.value }
}

function shouldRejectCaseField(row: BulkPricingProductRow): string | null {
  if (!row.allow_case) {
    return 'Case pricing is not available for this product'
  }
  if (safeUnitsPerCase(row.units_per_case) === null) {
    return 'Set units per case to use case pricing.'
  }
  return null
}

export function validateBulkPricingRule<T extends BulkPricingProductRow>(
  rows: T[],
  rule: BulkPricingRule | null
): BulkRuleValidationResult {
  if (!rule) return { ok: true }

  const targetedIds = new Set(rule.productIds)
  if (targetedIds.size === 0) {
    return {
      ok: false,
      error: 'Select at least one product for the bulk rule.',
      invalidProductIds: [],
      invalidProductNames: []
    }
  }

  const fieldKey = toFieldKey(rule.field)
  const targetedRows = rows.filter((row) => targetedIds.has(row.id))

  if (fieldKey === 'sell_per_case' || fieldKey === 'cost_per_case') {
    const caseDisabledRows = targetedRows.filter((row) => row.allow_case === false)
    if (caseDisabledRows.length > 0) {
      return {
        ok: false,
        error: 'Cannot apply case pricing to products where allow_case is false',
        invalidProductIds: caseDisabledRows.map((row) => row.id),
        invalidProductNames: caseDisabledRows.map((row) => row.name)
      }
    }

    const missingUnitsRows = targetedRows.filter((row) => safeUnitsPerCase(row.units_per_case) === null)
    if (missingUnitsRows.length > 0) {
      return {
        ok: false,
        error: 'Cannot apply case pricing: units_per_case must be at least 1 for all targeted products',
        invalidProductIds: missingUnitsRows.map((row) => row.id),
        invalidProductNames: missingUnitsRows.map((row) => row.name)
      }
    }
  }

  if (rule.changeType !== 'set') {
    const missingBaselineRows = targetedRows.filter((row) => getBulkBaselineValue(row, fieldKey) === null)
    if (missingBaselineRows.length > 0) {
      return {
        ok: false,
        error: getMissingBaselineError(fieldKey),
        invalidProductIds: missingBaselineRows.map((row) => row.id),
        invalidProductNames: missingBaselineRows.map((row) => row.name)
      }
    }
  }

  const negativeRows = targetedRows.filter((row) => {
    const baseline = getBulkBaselineValue(row, fieldKey)
    const nextValue = rule.changeType === 'set'
      ? moneyRound(rule.value, 4)
      : baseline === null
        ? null
        : computeBulkValue(baseline, rule.changeType, rule.value)

    return nextValue !== null && nextValue < 0
  })

  if (negativeRows.length > 0) {
    return {
      ok: false,
      error: getNegativeResultError(fieldKey),
      invalidProductIds: negativeRows.map((row) => row.id),
      invalidProductNames: negativeRows.map((row) => row.name)
    }
  }

  return { ok: true }
}

export function resolveBulkPricingRows<T extends BulkPricingProductRow>(params: {
  rows: T[]
  bulkRule: BulkPricingRule | null
  rowOverrides: BulkPricingRowOverrides
}): ResolvedBulkPricingRow<T>[] {
  const { rows, bulkRule, rowOverrides } = params
  const targetedIds = new Set(bulkRule?.productIds ?? [])
  const bulkField = bulkRule ? toFieldKey(bulkRule.field) : null

  return rows.map((row) => {
    const base = toValues(row)
    const final: BulkPricingValues = { ...base }
    const bulkPreview: Partial<BulkPricingValues> = {}
    const sources: Record<BulkEditablePriceField, BulkFieldSource> = {
      sell_per_unit: 'original',
      sell_per_case: 'original',
      cost_per_unit: 'original',
      cost_per_case: 'original'
    }
    const fieldErrors: Partial<Record<BulkEditablePriceField, string>> = {}
    const overrideFields: BulkEditablePriceField[] = []
    const isTargetedByBulk = Boolean(bulkRule && targetedIds.has(row.id))

    if (bulkRule && bulkField && isTargetedByBulk) {
      const baseline = getBulkBaselineValue(row, bulkField)
      if (bulkRule.changeType === 'set' || baseline !== null) {
        const nextValue = bulkRule.changeType === 'set'
          ? moneyRound(bulkRule.value, 4)
          : computeBulkValue(baseline as number, bulkRule.changeType, bulkRule.value)

        if (nextValue !== null) {
          final[bulkField] = nextValue
          bulkPreview[bulkField] = nextValue
          sources[bulkField] = 'bulk'
        }
      }
    }

    const rowOverride = rowOverrides[row.id]
    if (rowOverride) {
      for (const field of BULK_EDITABLE_PRICE_FIELDS) {
        const parsed = parseOverrideInput(rowOverride[field], field)
        if (parsed.kind === 'empty') continue

        if ((field === 'sell_per_case' || field === 'cost_per_case') && parsed.kind === 'valid') {
          const caseFieldError = shouldRejectCaseField(row)
          if (caseFieldError) {
            fieldErrors[field] = caseFieldError
            continue
          }
        }

        if (parsed.kind === 'invalid') {
          fieldErrors[field] = parsed.error
          continue
        }

        if (areBulkPricesEqual(parsed.value, final[field])) {
          continue
        }

        final[field] = parsed.value
        sources[field] = 'override'
        overrideFields.push(field)
      }
    }

    if (sources.sell_per_case !== 'original' && sources.sell_per_unit === 'original') {
      const syncedSellUnit = deriveSyncedUnitFromCase(final.sell_per_case, row.units_per_case)
      if (syncedSellUnit !== null) {
        final.sell_per_unit = syncedSellUnit
        sources.sell_per_unit = sources.sell_per_case
      }
    }

    if (sources.cost_per_case !== 'original' && sources.cost_per_unit === 'original') {
      const syncedCostUnit = deriveSyncedUnitFromCase(final.cost_per_case, row.units_per_case)
      if (syncedCostUnit !== null) {
        final.cost_per_unit = syncedCostUnit
        sources.cost_per_unit = sources.cost_per_case
      }
    }

    const changedFields = BULK_EDITABLE_PRICE_FIELDS.filter((field) => !areBulkPricesEqual(base[field], final[field]))

    return {
      ...row,
      base,
      bulkPreview,
      final,
      sources,
      fieldErrors,
      hasBulkChanges: Object.keys(bulkPreview).length > 0,
      hasOverride: overrideFields.length > 0,
      overrideFields,
      changedFields,
      isTargetedByBulk
    }
  })
}

export function buildBulkPricingSaveRows<T extends BulkPricingProductRow>(
  rows: Array<ResolvedBulkPricingRow<T>>
): BulkPricingSaveRow[] {
  return rows
    .filter((row) => row.changedFields.length > 0)
    .map((row) => ({
      productId: row.id,
      final: row.final,
      changedFields: row.changedFields,
      hasSellUnitChange: row.changedFields.includes('sell_per_unit'),
      hasSellCaseChange: row.changedFields.includes('sell_per_case'),
      hasCostUnitChange: row.changedFields.includes('cost_per_unit'),
      hasCostCaseChange: row.changedFields.includes('cost_per_case')
    }))
}
