import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_VENDOR_NOTE_LENGTH, validateVendorNote } from '@/lib/orders/vendor-note'

test('returns null for empty note input', () => {
  assert.deepEqual(validateVendorNote(undefined), { ok: true, note: null })
  assert.deepEqual(validateVendorNote('   '), { ok: true, note: null })
})

test('strips html and trims whitespace', () => {
  const result = validateVendorNote('  <b>Leave at front desk</b>\n ')
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('Expected successful validation')
  assert.equal(result.note, 'Leave at front desk')
})

test('rejects notes longer than max length', () => {
  const tooLong = 'a'.repeat(MAX_VENDOR_NOTE_LENGTH + 1)
  const result = validateVendorNote(tooLong)
  assert.equal(result.ok, false)
})
