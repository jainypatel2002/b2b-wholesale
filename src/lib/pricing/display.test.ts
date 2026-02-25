import test from 'node:test'
import assert from 'node:assert/strict'
import {
  moneyRound,
  formatMoney,
  computeUnitPrice,
  computeCasePrice,
  resolveCaseUnitPrices
} from './display'

test('moneyRound keeps 2-decimal currency rounding stable', () => {
  assert.equal(moneyRound(3.666666, 2), 3.67)
  assert.equal(moneyRound(7.5, 2), 7.5)
})

test('formatMoney returns USD-style text', () => {
  assert.equal(formatMoney(22), '$22.00')
  assert.equal(formatMoney(null), '$0.00')
})

test('computeUnitPrice derives case-to-unit using units_per_case', () => {
  assert.equal(computeUnitPrice(22, 6), 3.67)
  assert.equal(computeUnitPrice(60, 6), 10)
  assert.equal(computeUnitPrice(45, 0), null)
})

test('computeCasePrice derives unit-to-case using units_per_case', () => {
  assert.equal(computeCasePrice(3.67, 6), 22.02)
  assert.equal(computeCasePrice(10, 6), 60)
  assert.equal(computeCasePrice(10, null), null)
})

test('resolveCaseUnitPrices keeps stored values and derives only missing side', () => {
  const withBoth = resolveCaseUnitPrices({
    casePrice: 45,
    unitPrice: 7.5,
    unitsPerCase: 6
  })
  assert.deepEqual(withBoth, { casePrice: 45, unitPrice: 7.5 })

  const deriveUnit = resolveCaseUnitPrices({
    casePrice: 30,
    unitPrice: null,
    unitsPerCase: 6
  })
  assert.deepEqual(deriveUnit, { casePrice: 30, unitPrice: 5 })
})
