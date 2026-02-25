import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPriceUnitForBulkTarget,
  normalizeBulkPriceFieldTarget,
  resolveBulkPriceFieldTarget,
  toLegacyBulkPriceField
} from './bulkPriceTargets'

test('maps legacy COST alias to COST_UNIT', () => {
  const parsed = normalizeBulkPriceFieldTarget('COST')
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.value, 'COST_UNIT')
})

test('maps legacy DB field names to canonical targets', () => {
  const costPrice = normalizeBulkPriceFieldTarget('cost_price')
  assert.equal(costPrice.ok, true)
  if (costPrice.ok) assert.equal(costPrice.value, 'COST_UNIT')

  const costCase = normalizeBulkPriceFieldTarget('cost_case')
  assert.equal(costCase.ok, true)
  if (costCase.ok) assert.equal(costCase.value, 'COST_CASE')
})

test('resolves fieldTarget first when both inputs are present', () => {
  const resolved = resolveBulkPriceFieldTarget({
    fieldTarget: 'COST_CASE',
    field: 'sell_price'
  })
  assert.equal(resolved.ok, true)
  if (resolved.ok) assert.equal(resolved.value, 'COST_CASE')
})

test('derives expected price unit from canonical target', () => {
  assert.equal(getPriceUnitForBulkTarget('SELL_UNIT'), 'unit')
  assert.equal(getPriceUnitForBulkTarget('COST_UNIT'), 'unit')
  assert.equal(getPriceUnitForBulkTarget('SELL_CASE'), 'case')
  assert.equal(getPriceUnitForBulkTarget('COST_CASE'), 'case')
})

test('maps canonical targets back to legacy DB fields', () => {
  assert.equal(toLegacyBulkPriceField('SELL_UNIT'), 'sell_price')
  assert.equal(toLegacyBulkPriceField('SELL_CASE'), 'price_case')
  assert.equal(toLegacyBulkPriceField('COST_UNIT'), 'cost_price')
  assert.equal(toLegacyBulkPriceField('COST_CASE'), 'cost_case')
})

test('rejects unknown field targets', () => {
  const parsed = normalizeBulkPriceFieldTarget('UNKNOWN_FIELD')
  assert.equal(parsed.ok, false)
})

