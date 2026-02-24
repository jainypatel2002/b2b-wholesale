import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBusinessProfilePayload } from './business-profile-validation'

test('valid payload is trimmed and normalized', () => {
  const result = validateBusinessProfilePayload({
    business_name: '  Acme Supply  ',
    contact_name: '  Jane Doe ',
    email: ' billing@acme.com ',
    phone: ' (555) 123-4567 ',
    address_line1: ' 123 Main St ',
    city: ' Boston ',
    state: ' MA ',
    postal_code: ' 02110 ',
    country: ' ',
    tax_id: ' 12-3456789 '
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.data.business_name, 'Acme Supply')
  assert.equal(result.data.email, 'billing@acme.com')
  assert.equal(result.data.phone, '(555) 123-4567')
  assert.equal(result.data.country, 'USA')
})

test('invalid payload returns required and format errors', () => {
  const result = validateBusinessProfilePayload({
    business_name: '',
    address_line1: '',
    city: '',
    state: '',
    postal_code: '',
    phone: 'abc',
    email: 'bad-email'
  })

  assert.equal(result.success, false)
  assert.ok(result.errors.includes('business_name is required.'))
  assert.ok(result.errors.includes('address_line1 is required.'))
  assert.ok(result.errors.includes('email format is invalid.'))
  assert.ok(result.errors.includes('phone format is invalid.'))
})
