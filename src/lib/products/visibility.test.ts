import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getProductVisibilitySummary,
  normalizeVendorVisibilityScope,
  normalizeVisibleVendorIds,
  productIsHiddenForVendors,
} from './visibility'

test('normalizeVendorVisibilityScope falls back to all', () => {
  assert.equal(normalizeVendorVisibilityScope('selected'), 'selected')
  assert.equal(normalizeVendorVisibilityScope('all'), 'all')
  assert.equal(normalizeVendorVisibilityScope('unexpected'), 'all')
  assert.equal(normalizeVendorVisibilityScope(null), 'all')
})

test('normalizeVisibleVendorIds dedupes and filters invalid ids', () => {
  const vendorIds = normalizeVisibleVendorIds([
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'not-a-uuid',
    '22222222-2222-4222-8222-222222222222',
  ])

  assert.deepEqual(vendorIds, [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ])
})

test('productIsHiddenForVendors treats selected scope with no vendors as hidden', () => {
  assert.equal(productIsHiddenForVendors({
    isVisibleToVendors: false,
    vendorVisibilityScope: 'all',
    selectedVendorCount: 2,
  }), true)

  assert.equal(productIsHiddenForVendors({
    isVisibleToVendors: true,
    vendorVisibilityScope: 'selected',
    selectedVendorCount: 0,
  }), true)

  assert.equal(productIsHiddenForVendors({
    isVisibleToVendors: true,
    vendorVisibilityScope: 'selected',
    selectedVendorCount: 1,
  }), false)
})

test('getProductVisibilitySummary returns user-facing labels for each mode', () => {
  assert.deepEqual(getProductVisibilitySummary({
    isVisibleToVendors: false,
    vendorVisibilityScope: 'all',
    selectedVendorCount: 0,
    linkedVendorCount: 3,
  }), {
    label: 'Hidden from vendors',
    tone: 'danger',
  })

  assert.deepEqual(getProductVisibilitySummary({
    isVisibleToVendors: true,
    vendorVisibilityScope: 'selected',
    selectedVendorCount: 0,
    linkedVendorCount: 3,
  }), {
    label: 'Hidden until vendors are selected',
    tone: 'warning',
  })

  assert.deepEqual(getProductVisibilitySummary({
    isVisibleToVendors: true,
    vendorVisibilityScope: 'selected',
    selectedVendorCount: 2,
    linkedVendorCount: 3,
  }), {
    label: '2 vendors selected',
    tone: 'warning',
  })

  assert.deepEqual(getProductVisibilitySummary({
    isVisibleToVendors: true,
    vendorVisibilityScope: 'all',
    selectedVendorCount: 0,
    linkedVendorCount: 3,
  }), {
    label: 'Visible to all vendors (3)',
    tone: 'default',
  })
})
