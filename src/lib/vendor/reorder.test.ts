import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addManyToCart } from '@/lib/vendor/reorder'

const PRODUCT_A = '11111111-1111-4111-8111-111111111111'
const PRODUCT_B = '22222222-2222-4222-8222-222222222222'

test('merges quantities for matching product + unit', () => {
  const merged = addManyToCart(
    [
      { product_id: PRODUCT_A, name: 'Product A', unit_price: 5, qty: 2, order_unit: 'piece' }
    ],
    [
      { product_id: PRODUCT_A, name: 'Product A', unit_price: 6, qty: 3, order_unit: 'piece' }
    ]
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0].qty, 5)
  assert.equal(merged[0].unit_price, 6)
})

test('keeps case and piece lines separate', () => {
  const merged = addManyToCart(
    [
      { product_id: PRODUCT_A, name: 'Product A', unit_price: 20, qty: 1, order_unit: 'case' }
    ],
    [
      { product_id: PRODUCT_A, name: 'Product A', unit_price: 5, qty: 2, order_unit: 'piece' }
    ]
  )

  assert.equal(merged.length, 2)
  const units = merged.map((line) => line.order_unit).sort()
  assert.deepEqual(units, ['case', 'piece'])
})

test('drops invalid lines and keeps valid entries', () => {
  const merged = addManyToCart(
    [
      { product_id: PRODUCT_A, name: 'Valid', unit_price: 2.5, qty: 1, order_unit: 'piece' }
    ],
    [
      { product_id: PRODUCT_B, name: 'Invalid qty', unit_price: 7, qty: 0, order_unit: 'piece' },
      { product_id: PRODUCT_B, name: 'Valid B', unit_price: 9, qty: 2, order_unit: 'case' }
    ]
  )

  assert.equal(merged.length, 2)
  assert.ok(merged.some((line) => line.product_id === PRODUCT_A))
  assert.ok(merged.some((line) => line.product_id === PRODUCT_B && line.order_unit === 'case'))
})
