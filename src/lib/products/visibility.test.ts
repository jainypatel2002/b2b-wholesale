import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyBulkProductVisibilitySummary,
  getBulkProductVisibilitySuccessMessage,
  normalizeBulkProductVisibilityOperation,
  normalizeUuidIds,
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

test('normalizeUuidIds supports generic product and vendor selections', () => {
  const ids = normalizeUuidIds([
    '33333333-3333-4333-8333-333333333333',
    'not-a-uuid',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ])

  assert.deepEqual(ids, [
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ])
})

test('normalizeBulkProductVisibilityOperation accepts supported operations only', () => {
  assert.equal(normalizeBulkProductVisibilityOperation('set_visible'), 'set_visible')
  assert.equal(normalizeBulkProductVisibilityOperation('set_selected_vendors'), 'set_selected_vendors')
  assert.equal(normalizeBulkProductVisibilityOperation('unexpected'), null)
  assert.equal(normalizeBulkProductVisibilityOperation(null), null)
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

test('createEmptyBulkProductVisibilitySummary starts at zero counts', () => {
  assert.deepEqual(createEmptyBulkProductVisibilitySummary(4), {
    totalSelected: 4,
    updatedCount: 0,
    skippedCount: 0,
    invalidProductIdsCount: 0,
    invalidVendorIdsCount: 0,
  })
})

test('getBulkProductVisibilitySuccessMessage reports updates and skipped products', () => {
  const message = getBulkProductVisibilitySuccessMessage('set_scope_all', {
    totalSelected: 5,
    updatedCount: 3,
    skippedCount: 1,
    invalidProductIdsCount: 1,
    invalidVendorIdsCount: 0,
  })

  assert.equal(message, 'Set to all linked vendors for 3 products. 1 already matched. 1 unavailable skipped.')
})

test('getBulkProductVisibilitySuccessMessage handles no-op bulk updates', () => {
  const message = getBulkProductVisibilitySuccessMessage('set_hidden', {
    totalSelected: 2,
    updatedCount: 0,
    skippedCount: 2,
    invalidProductIdsCount: 0,
    invalidVendorIdsCount: 0,
  })

  assert.equal(message, 'No visibility changes were needed for 2 products.')
})
