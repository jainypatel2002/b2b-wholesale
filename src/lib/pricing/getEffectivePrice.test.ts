import test from 'node:test'
import assert from 'node:assert/strict'
import { getEffectivePrice } from './getEffectivePrice'

test('vendor override wins over bulk and default', () => {
  const result = getEffectivePrice({
    unitType: 'piece',
    product: { sell_per_unit: 10, sell_per_case: 90, units_per_case: 10 },
    bulkOverride: { price_per_unit: 9 },
    vendorOverride: { price_per_unit: 8.5 }
  })

  assert.equal(result.price, 8.5)
  assert.equal(result.source, 'vendor_override')
})

test('bulk override wins when vendor override missing', () => {
  const result = getEffectivePrice({
    unitType: 'piece',
    product: { sell_per_unit: 10, units_per_case: 10 },
    bulkOverride: { price_per_unit: 9.25 }
  })

  assert.equal(result.price, 9.25)
  assert.equal(result.source, 'bulk_override')
})

test('default product pricing is used when overrides missing', () => {
  const result = getEffectivePrice({
    unitType: 'piece',
    product: { sell_per_unit: 7.75, units_per_case: 6 }
  })

  assert.equal(result.price, 7.75)
  assert.equal(result.source, 'product_default')
})

test('case pricing derives from unit price when explicit case is missing', () => {
  const result = getEffectivePrice({
    unitType: 'case',
    product: { sell_per_unit: 2, units_per_case: 12 }
  })

  assert.equal(result.price, 24)
  assert.equal(result.source, 'product_default')
})

test('empty values stay null and do not coerce to zero', () => {
  const result = getEffectivePrice({
    unitType: 'piece',
    product: { sell_per_unit: '', sell_per_case: null, units_per_case: 10 },
    vendorOverride: { price_per_unit: undefined },
    bulkOverride: { price_per_case: '' }
  })

  assert.equal(result.price, null)
  assert.equal(result.source, null)
})

