import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
    getBarcodeLookupCandidates,
    isLookupBarcodeValid,
    normalizeBarcode,
    sanitizeBarcode
} from './barcode'

describe('normalizeBarcode', () => {
    test('trims and uppercases alphanumeric values', () => {
        assert.equal(normalizeBarcode('  Abc-123  '), 'ABC123')
    })

    test('returns empty string for non-alphanumeric-only input', () => {
        assert.equal(normalizeBarcode(' -_ '), '')
    })

    test('removes one leading zero when present', () => {
        assert.equal(normalizeBarcode('0123456'), '123456')
        assert.equal(normalizeBarcode('0012345'), '012345')
    })
})

describe('sanitizeBarcode', () => {
    test('removes spaces and special characters', () => {
        assert.equal(sanitizeBarcode('  123 456-789  '), '123456789')
    })

    test('removes one leading zero', () => {
        assert.equal(sanitizeBarcode('0012345'), '012345')
    })

    test('preserves letters', () => {
        assert.equal(sanitizeBarcode('a-B_C 123'), 'ABC123')
    })

    test('returns empty string if only invalid characters are provided', () => {
        assert.equal(sanitizeBarcode(' -_ '), '')
    })
})

describe('getBarcodeLookupCandidates', () => {
    test('includes normalized and legacy-compatible values', () => {
        assert.deepEqual(getBarcodeLookupCandidates('0123456'), ['123456', '0123456'])
    })

    test('includes prefixed fallback for normalized input', () => {
        assert.deepEqual(getBarcodeLookupCandidates('123456'), ['123456', '0123456'])
    })
})

describe('isLookupBarcodeValid', () => {
    test('accepts legacy-compatible inputs that still have a valid lookup candidate', () => {
        assert.equal(isLookupBarcodeValid('012345'), true)
    })

    test('rejects short inputs', () => {
        assert.equal(isLookupBarcodeValid('1234'), false)
    })
})
