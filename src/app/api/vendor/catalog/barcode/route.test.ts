import assert from 'node:assert/strict'
import test from 'node:test'
import { mapRpcRows } from './route'

test('mapRpcRows maps direct numeric pricing fields', () => {
  const rows = mapRpcRows([
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Cola 12oz',
      sku: 'COLA-12',
      allow_piece: true,
      allow_case: true,
      units_per_case: 24,
      sell_per_unit: 1.25,
      sell_per_case: 30,
      override_unit_price: 1.1,
      override_case_price: 26.4,
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '11111111-1111-4111-8111-111111111111')
  assert.equal(rows[0].sell_per_unit, 1.25)
  assert.equal(rows[0].sell_per_case, 30)
  assert.equal(rows[0].override_unit_price, 1.1)
  assert.equal(rows[0].override_case_price, 26.4)
})

test('mapRpcRows falls back to legacy cents and infers case pricing', () => {
  const rows = mapRpcRows([
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Water Bottle',
      units_per_case: 12,
      base_price_cents: 250,
      effective_price_cents: 225,
      allow_piece: true,
      allow_case: true,
    },
    {
      id: 'not-a-uuid',
      name: 'Invalid Row',
      units_per_case: 6,
      base_price_cents: 100,
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '22222222-2222-4222-8222-222222222222')
  assert.equal(rows[0].sell_per_unit, 2.5)
  assert.equal(rows[0].sell_per_case, 30)
  assert.equal(rows[0].override_unit_price, 2.25)
})
