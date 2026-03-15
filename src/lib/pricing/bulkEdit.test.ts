import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBulkPricingSaveRows,
  resolveBulkPricingRows,
  validateBulkPricingRule,
  type BulkPricingProductRow,
  type BulkPricingRule,
  type BulkPricingRowOverrides
} from './bulkEdit'

const rows: BulkPricingProductRow[] = [
  {
    id: 'coffee',
    name: 'Coffee',
    allow_case: true,
    units_per_case: 6,
    sell_per_unit: 10,
    sell_per_case: 60,
    cost_per_unit: 6,
    cost_per_case: 36
  },
  {
    id: 'tea',
    name: 'Tea',
    allow_case: true,
    units_per_case: 12,
    sell_per_unit: 8,
    sell_per_case: 96,
    cost_per_unit: 4,
    cost_per_case: 48
  }
]

function resolve(rule: BulkPricingRule | null, overrides: BulkPricingRowOverrides = {}) {
  return resolveBulkPricingRows({
    rows,
    bulkRule: rule,
    rowOverrides: overrides
  })
}

test('validateBulkPricingRule rejects case targets when allow_case is false', () => {
  const result = validateBulkPricingRule([
    {
      ...rows[0],
      allow_case: false
    }
  ], {
    field: 'SELL_CASE',
    changeType: 'percent',
    value: 10,
    productIds: ['coffee']
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'Cannot apply case pricing to products where allow_case is false')
    assert.deepEqual(result.invalidProductIds, ['coffee'])
  }
})

test('non-overridden rows keep the existing bulk result', () => {
  const resolved = resolve({
    field: 'SELL_UNIT',
    changeType: 'percent',
    value: 10,
    productIds: ['coffee', 'tea']
  })

  assert.equal(resolved[0].final.sell_per_unit, 11)
  assert.equal(resolved[1].final.sell_per_unit, 8.8)
  assert.equal(resolved[0].sources.sell_per_unit, 'bulk')
  assert.equal(resolved[1].sources.sell_per_unit, 'bulk')
})

test('row overrides win over the staged bulk value for that field only', () => {
  const resolved = resolve({
    field: 'SELL_UNIT',
    changeType: 'percent',
    value: 10,
    productIds: ['coffee', 'tea']
  }, {
    tea: {
      sell_per_unit: '9.25'
    }
  })

  const coffee = resolved.find((row) => row.id === 'coffee')!
  const tea = resolved.find((row) => row.id === 'tea')!

  assert.equal(coffee.final.sell_per_unit, 11)
  assert.equal(tea.final.sell_per_unit, 9.25)
  assert.equal(tea.sources.sell_per_unit, 'override')
  assert.deepEqual(tea.overrideFields, ['sell_per_unit'])
})

test('case overrides sync the matching unit field using the bulk save semantics', () => {
  const resolved = resolve(null, {
    coffee: {
      sell_per_case: '75'
    }
  })

  const coffee = resolved.find((row) => row.id === 'coffee')!
  assert.equal(coffee.final.sell_per_case, 75)
  assert.equal(coffee.final.sell_per_unit, 12.5)
  assert.equal(coffee.sources.sell_per_case, 'override')
  assert.equal(coffee.sources.sell_per_unit, 'override')
})

test('changing the bulk rule later preserves explicit overrides', () => {
  const overrides: BulkPricingRowOverrides = {
    tea: {
      sell_per_unit: '9.5'
    }
  }

  const firstPass = resolve({
    field: 'SELL_UNIT',
    changeType: 'percent',
    value: 10,
    productIds: ['coffee', 'tea']
  }, overrides)
  const secondPass = resolve({
    field: 'SELL_UNIT',
    changeType: 'fixed',
    value: 2,
    productIds: ['coffee', 'tea']
  }, overrides)

  assert.equal(firstPass.find((row) => row.id === 'tea')!.final.sell_per_unit, 9.5)
  assert.equal(secondPass.find((row) => row.id === 'tea')!.final.sell_per_unit, 9.5)
  assert.equal(secondPass.find((row) => row.id === 'coffee')!.final.sell_per_unit, 12)
})

test('buildBulkPricingSaveRows returns only changed products', () => {
  const resolved = resolve({
    field: 'COST_CASE',
    changeType: 'set',
    value: 45,
    productIds: ['coffee']
  })

  const saveRows = buildBulkPricingSaveRows(resolved)
  assert.equal(saveRows.length, 1)
  assert.equal(saveRows[0].productId, 'coffee')
  assert.equal(saveRows[0].final.cost_per_case, 45)
  assert.equal(saveRows[0].final.cost_per_unit, 7.5)
  assert.equal(saveRows[0].hasCostCaseChange, true)
  assert.equal(saveRows[0].hasCostUnitChange, true)
})

test('clearing an override drops the custom row state', () => {
  const withOverride = resolve(null, {
    coffee: {
      sell_per_unit: '13'
    }
  })
  const withoutOverride = resolve(null, {})

  assert.equal(withOverride.find((row) => row.id === 'coffee')!.hasOverride, true)
  assert.equal(withoutOverride.find((row) => row.id === 'coffee')!.hasOverride, false)
  assert.equal(withoutOverride.find((row) => row.id === 'coffee')!.final.sell_per_unit, 10)
})
