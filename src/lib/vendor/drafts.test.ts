import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDraftCartPayload, sanitizeDraftName } from '@/lib/vendor/drafts'

const PRODUCT_A = '11111111-1111-4111-8111-111111111111'

test('normalizeDraftCartPayload restores valid cart rows', () => {
  const payload = normalizeDraftCartPayload({
    items: [
      {
        product_id: PRODUCT_A,
        name: 'Widget',
        unit_price: 9.5,
        unit_price_snapshot: 9.5,
        case_price_snapshot: 95,
        qty: 2,
        order_unit: 'piece',
        units_per_case: 10
      }
    ]
  })

  assert.equal(payload.items.length, 1)
  assert.equal(payload.items[0].product_id, PRODUCT_A)
  assert.equal(payload.items[0].qty, 2)
  assert.equal(payload.items[0].order_unit, 'piece')
})

test('normalizeDraftCartPayload drops invalid rows', () => {
  const payload = normalizeDraftCartPayload({
    items: [
      { product_id: 'bad-id', qty: 2, order_unit: 'piece', unit_price: 5 },
      { product_id: PRODUCT_A, qty: 0, order_unit: 'piece', unit_price: 5 }
    ]
  })

  assert.equal(payload.items.length, 0)
})

test('sanitizeDraftName trims and caps length', () => {
  assert.equal(sanitizeDraftName('  Friday Run  '), 'Friday Run')
  assert.equal(sanitizeDraftName(''), null)
  assert.equal(sanitizeDraftName(' '.repeat(5)), null)
  const long = 'a'.repeat(200)
  assert.equal(sanitizeDraftName(long)?.length, 120)
})

