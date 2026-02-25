import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addOrIncrementProductInCart,
  decrementProductInCart,
  getCartItemQuantity,
  normalizeCartItems
} from '@/lib/vendor/cart-storage'

const PRODUCT_A = '11111111-1111-4111-8111-111111111111'

const BASE_PRODUCT = {
  id: PRODUCT_A,
  name: 'Widget',
  allow_piece: true,
  allow_case: true,
  units_per_case: 12,
  sell_per_unit: 2,
  sell_per_case: 20,
  override_unit_price: null,
  override_case_price: null
}

test('addOrIncrementProductInCart adds then increments same product+unit', () => {
  const first = addOrIncrementProductInCart([], BASE_PRODUCT, 'piece', 1)
  const second = addOrIncrementProductInCart(first, BASE_PRODUCT, 'piece', 2)

  assert.equal(second.length, 1)
  assert.equal(second[0].qty, 3)
  assert.equal(second[0].order_unit, 'piece')
  assert.equal(second[0].unit_price_snapshot, 2)
  assert.equal(second[0].case_price_snapshot, 20)
})

test('decrementProductInCart removes a line when quantity reaches zero', () => {
  const seeded = normalizeCartItems([
    {
      product_id: PRODUCT_A,
      name: 'Widget',
      unit_price: 2,
      unit_price_snapshot: 2,
      case_price_snapshot: 20,
      qty: 1,
      order_unit: 'piece'
    }
  ])

  const next = decrementProductInCart(seeded, PRODUCT_A, 'piece', 1)
  assert.equal(next.length, 0)
})

test('getCartItemQuantity returns unit-specific quantity', () => {
  const seeded = normalizeCartItems([
    {
      product_id: PRODUCT_A,
      name: 'Widget',
      unit_price: 20,
      unit_price_snapshot: 2,
      case_price_snapshot: 20,
      qty: 2,
      order_unit: 'case'
    },
    {
      product_id: PRODUCT_A,
      name: 'Widget',
      unit_price: 2,
      unit_price_snapshot: 2,
      case_price_snapshot: 20,
      qty: 5,
      order_unit: 'piece'
    }
  ])

  assert.equal(getCartItemQuantity(seeded, PRODUCT_A, 'case'), 2)
  assert.equal(getCartItemQuantity(seeded, PRODUCT_A, 'piece'), 5)
})

