import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTransactionLine, type NormalizedTransactionLine } from './transactions'

const SOURCE = {
  sourceType: 'invoice' as const,
  sourceId: 'inv-1',
  sourceDate: '2026-02-26T00:00:00.000Z',
  vendorId: 'vendor-1',
  orderId: 'order-1'
}

function assertClose(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, got ${actual}`)
}

test('normalization keeps case math aligned: case qty with case price', () => {
  const line = normalizeTransactionLine(
    {
      product_id: 'prod-1',
      product_name: 'cigar',
      order_unit: 'case',
      qty: 4,
      units_per_case_snapshot: 6,
      unit_price: 31,
      unit_cost: 1.25,
      total_pieces: 24
    },
    SOURCE
  )

  assert.equal(line.soldUnit, 'case')
  assert.equal(line.soldCases, 4)
  assert.equal(line.soldUnits, 24)
  assertClose(line.revenue, 124)
  assertClose(line.cost, 30)
  assertClose(line.profit, 94)
})

test('normalization keeps unit math aligned: unit qty with unit price', () => {
  const line = normalizeTransactionLine(
    {
      product_id: 'prod-1',
      product_name: 'cigar',
      order_unit: 'piece',
      qty: 10,
      units_per_case_snapshot: 6,
      unit_price: 5.17,
      unit_cost: 2
    },
    SOURCE
  )

  assert.equal(line.soldUnit, 'unit')
  assert.equal(line.soldCases, 10 / 6)
  assert.equal(line.soldUnits, 10)
  assertClose(line.revenue, 51.7)
  assertClose(line.cost, 20)
  assertClose(line.profit, 31.7)
})

test('line_total snapshot is authoritative for revenue when present', () => {
  const line = normalizeTransactionLine(
    {
      product_id: 'prod-1',
      product_name: 'cigar 2',
      order_unit: 'case',
      qty: 5,
      units_per_case_snapshot: 6,
      unit_price: 999,
      line_total_snapshot: 155,
      unit_cost: 1
    },
    SOURCE
  )

  assertClose(line.revenue, 155)
  assertClose(line.cost, 30)
})

test('mixed case + unit lines aggregate into correct totals', () => {
  const lines: NormalizedTransactionLine[] = [
    normalizeTransactionLine(
      {
        product_id: 'prod-1',
        product_name: 'cigar',
        order_unit: 'case',
        qty: 4,
        units_per_case_snapshot: 6,
        unit_price: 31,
        unit_cost: 1.25,
        total_pieces: 24
      },
      SOURCE
    ),
    normalizeTransactionLine(
      {
        product_id: 'prod-1',
        product_name: 'cigar',
        order_unit: 'piece',
        qty: 10,
        units_per_case_snapshot: 6,
        unit_price: 5.17,
        unit_cost: 2
      },
      SOURCE
    )
  ]

  const aggregate = lines.reduce(
    (acc, line) => {
      if (line.soldUnit === 'case') acc.caseQty += line.soldQty
      else acc.unitQty += line.soldQty

      if (line.soldUnits !== null) acc.unitsEquivalent += line.soldUnits
      acc.revenue += line.revenue
      acc.cost += line.cost
      return acc
    },
    { caseQty: 0, unitQty: 0, unitsEquivalent: 0, revenue: 0, cost: 0 }
  )

  assertClose(aggregate.caseQty, 4)
  assertClose(aggregate.unitQty, 10)
  assertClose(aggregate.unitsEquivalent, 34)
  assertClose(aggregate.revenue, 175.7)
  assertClose(aggregate.cost, 50)
  assertClose(aggregate.revenue - aggregate.cost, 125.7)
})
