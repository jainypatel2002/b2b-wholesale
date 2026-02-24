'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth'
import { upsertMyBusinessProfile } from '@/lib/business-profiles'
import type { BusinessProfileInput } from '@/lib/business-profile-validation'

const PROFILE_FIELDS: Array<keyof BusinessProfileInput> = [
  'business_name',
  'contact_name',
  'email',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'tax_id',
  'notes'
]

export async function upsertMyBusinessProfileAction(formData: FormData) {
  const payload = PROFILE_FIELDS.reduce<BusinessProfileInput>((acc, field) => {
    acc[field] = String(formData.get(field) || '')
    return acc
  }, {})

  const result = await upsertMyBusinessProfile(payload)
  if (!result.success) {
    return result
  }

  const profile = await requireProfile()
  const root = profile.role === 'vendor' ? '/vendor' : '/distributor'

  revalidatePath(root)
  revalidatePath(`${root}/settings`)
  revalidatePath('/distributor/invoices')
  revalidatePath('/vendor/invoices')

  return result
}
