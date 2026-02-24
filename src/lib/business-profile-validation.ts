export interface BusinessProfileInput {
  business_name?: unknown
  contact_name?: unknown
  email?: unknown
  phone?: unknown
  address_line1?: unknown
  address_line2?: unknown
  city?: unknown
  state?: unknown
  postal_code?: unknown
  country?: unknown
  tax_id?: unknown
  notes?: unknown
}

export interface BusinessProfilePayload {
  business_name: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  tax_id: string | null
  notes: string | null
}

export interface ValidationResult {
  success: boolean
  data: BusinessProfilePayload
  errors: string[]
}

interface ValidateOptions {
  requireMinimumFields?: boolean
}

const MAX_LENGTH: Record<keyof BusinessProfilePayload, number> = {
  business_name: 120,
  contact_name: 120,
  email: 254,
  phone: 40,
  address_line1: 200,
  address_line2: 200,
  city: 80,
  state: 80,
  postal_code: 20,
  country: 80,
  tax_id: 80,
  notes: 1000
}

const REQUIRED_MIN_FIELDS: Array<keyof BusinessProfilePayload> = [
  'business_name',
  'address_line1',
  'city',
  'state',
  'postal_code',
  'phone',
  'email'
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^[0-9+()\-. ]{7,20}$/

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nullable(value: string): string | null {
  return value.length > 0 ? value : null
}

export function validateBusinessProfilePayload(
  input: BusinessProfileInput,
  options: ValidateOptions = {}
): ValidationResult {
  const requireMinimumFields = options.requireMinimumFields ?? true

  const cleaned = {
    business_name: normalizeText(input.business_name),
    contact_name: normalizeText(input.contact_name),
    email: normalizeText(input.email),
    phone: normalizeText(input.phone),
    address_line1: normalizeText(input.address_line1),
    address_line2: normalizeText(input.address_line2),
    city: normalizeText(input.city),
    state: normalizeText(input.state),
    postal_code: normalizeText(input.postal_code),
    country: normalizeText(input.country) || 'USA',
    tax_id: normalizeText(input.tax_id),
    notes: normalizeText(input.notes)
  }

  const errors: string[] = []

  for (const [key, max] of Object.entries(MAX_LENGTH) as Array<[keyof BusinessProfilePayload, number]>) {
    const value = cleaned[key] as string
    if (value.length > max) {
      errors.push(`${key} cannot exceed ${max} characters.`)
    }
  }

  if (requireMinimumFields) {
    for (const field of REQUIRED_MIN_FIELDS) {
      if (cleaned[field].length === 0) {
        errors.push(`${field} is required.`)
      }
    }
  }

  if (cleaned.email && !EMAIL_REGEX.test(cleaned.email)) {
    errors.push('email format is invalid.')
  }

  if (cleaned.phone && !PHONE_REGEX.test(cleaned.phone)) {
    errors.push('phone format is invalid.')
  }

  return {
    success: errors.length === 0,
    data: {
      business_name: nullable(cleaned.business_name),
      contact_name: nullable(cleaned.contact_name),
      email: nullable(cleaned.email),
      phone: nullable(cleaned.phone),
      address_line1: nullable(cleaned.address_line1),
      address_line2: nullable(cleaned.address_line2),
      city: nullable(cleaned.city),
      state: nullable(cleaned.state),
      postal_code: nullable(cleaned.postal_code),
      country: cleaned.country || 'USA',
      tax_id: nullable(cleaned.tax_id),
      notes: nullable(cleaned.notes)
    },
    errors
  }
}
