import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeBarcode } from './barcode'

describe('sanitizeBarcode', () => {
    test('removes spaces and special characters', () => {
        assert.equal(sanitizeBarcode('  123 456-789  '), '123456789')
    })

    test('preserves leading zeros', () => {
        assert.equal(sanitizeBarcode('0012345'), '0012345')
    })

    test('preserves letters', () => {
        assert.equal(sanitizeBarcode('A-B_C 123'), 'ABC123')
    })

    test('returns empty string if only invalid characters are provided', () => {
        assert.equal(sanitizeBarcode(' -_ '), '')
    })
})
