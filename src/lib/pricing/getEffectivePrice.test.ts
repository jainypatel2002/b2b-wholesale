import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeEquivalentCase,
  computeEquivalentUnit,
  getEffectivePrices,
  getEffectivePrice,
  getRequiredEffectivePrice,
  MissingEffectivePriceError,
  resolveEffectivePrice
} from './getEffectivePrice'

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

test('case pricing is derived from unit price when needed', () => {
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

test('computeEquivalentUnit derives display-only item equivalent', () => {
  assert.equal(computeEquivalentUnit(55, 10), 5.5)
  assert.equal(computeEquivalentUnit(55, 0), null)
})

test('computeEquivalentCase derives display-only case equivalent', () => {
  assert.equal(computeEquivalentCase(5.5, 10), 55)
  assert.equal(computeEquivalentCase(5.5, 0), null)
})

test('resolveEffectivePrice keeps case override/unit override scopes separate', () => {
  const result = resolveEffectivePrice({
    priceUnit: 'case',
    product: { sell_per_unit: 10, sell_per_case: 90, units_per_case: 10 },
    bulkOverride: { price_per_unit: 8.5, price_per_case: 88 },
    vendorOverride: { price_per_unit: 7.5 }
  })

  assert.equal(result.price, 88)
  assert.equal(result.source, 'bulk_override')
})

test('getEffectivePrices returns canonical unit/case pair with vendor override precedence', () => {
  const result = getEffectivePrices({
    product: { sell_per_unit: 9.4286, sell_per_case: 66, units_per_case: 7 },
    vendorOverride: { price_per_case: 50 }
  })

  assert.equal(result.effective_case_price, 50)
  assert.equal(result.effective_unit_price, 7.142857)
  assert.equal(result.case_source, 'vendor_override')
  assert.equal(result.unit_source, 'vendor_override')
  assert.equal(result.case_display, '50.00')
  assert.equal(result.unit_display, '7.14')
})

test('getRequiredEffectivePrice throws controlled error when missing case price', () => {
  assert.throws(() => {
    getRequiredEffectivePrice({
      unitType: 'case',
      product: { sell_per_unit: null, sell_per_case: null, units_per_case: 12 }
    })
  }, (error: unknown) => {
    assert.ok(error instanceof MissingEffectivePriceError)
    assert.equal((error as MissingEffectivePriceError).unitType, 'case')
    assert.equal((error as MissingEffectivePriceError).message, 'Set case price in inventory before ordering by case.')
    return true
  })
})
