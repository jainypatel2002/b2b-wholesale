import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'
import {
  type BusinessProfileInput,
  type BusinessProfilePayload,
  validateBusinessProfilePayload
} from '@/lib/business-profile-validation'

interface BusinessProfileRow {
  id: string
  user_id: string
  business_name: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  tax_id: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

interface LegacyProfileRow {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
  location_address: string | null
}

export interface BusinessProfileData {
  user_id: string
  business_name: string
  contact_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  tax_id: string
  notes: string
  created_at: string | null
  updated_at: string | null
}

export interface UpsertBusinessProfileResult {
  success: boolean
  message: string
  errors?: string[]
  profile?: BusinessProfileData
}

export interface VendorProfileLookupContext {
  distributorId?: string
  orderId?: string
  invoiceId?: string
}

function stringOrEmpty(value: string | null | undefined): string {
  return value ?? ''
}

function mapBusinessProfile(
  row: BusinessProfileRow | null,
  userId: string,
  legacy: LegacyProfileRow | null
): BusinessProfileData {
  return {
    user_id: userId,
    business_name: stringOrEmpty(row?.business_name || legacy?.display_name || legacy?.email),
    contact_name: stringOrEmpty(row?.contact_name),
    email: stringOrEmpty(row?.email || legacy?.email),
    phone: stringOrEmpty(row?.phone || legacy?.phone),
    address_line1: stringOrEmpty(row?.address_line1 || legacy?.location_address),
    address_line2: stringOrEmpty(row?.address_line2),
    city: stringOrEmpty(row?.city),
    state: stringOrEmpty(row?.state),
    postal_code: stringOrEmpty(row?.postal_code),
    country: stringOrEmpty(row?.country || 'USA'),
    tax_id: stringOrEmpty(row?.tax_id),
    notes: stringOrEmpty(row?.notes),
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null
  }
}

async function getLegacyProfileRow(userId: string): Promise<LegacyProfileRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,email,phone,location_address')
    .eq('id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to read profile fallback: ${error.message}`)
  }

  return (data as LegacyProfileRow | null) ?? null
}

async function loadBusinessProfileRow(userId: string): Promise<BusinessProfileRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load business profile: ${error.message}`)
  }

  return (data as BusinessProfileRow | null) ?? null
}

async function ensureMyBusinessProfileRow(userId: string): Promise<BusinessProfileRow | null> {
  let row = await loadBusinessProfileRow(userId)
  if (row) return row

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('business_profiles')
    .insert({ user_id: userId })
    .select('*')
    .maybeSingle()

  if (error && error.code !== '23505') {
    throw new Error(`Failed to create business profile: ${error.message}`)
  }

  row = (data as BusinessProfileRow | null) ?? (await loadBusinessProfileRow(userId))
  return row
}

function buildLegacyLocationAddress(payload: BusinessProfilePayload): string | null {
  const line1 = payload.address_line1 ?? ''
  const line2 = payload.address_line2 ?? ''
  const city = payload.city ?? ''
  const state = payload.state ?? ''
  const postalCode = payload.postal_code ?? ''
  const country = payload.country ?? ''

  if (!line1) return null

  const cityState = [city, state].filter(Boolean).join(', ')
  const cityStatePostal = [cityState, postalCode].filter(Boolean).join(' ')
  const lines = [line1, line2, cityStatePostal, country].filter(Boolean)
  return lines.length > 0 ? lines.join('\n') : null
}

async function syncLegacyProfileFields(userId: string, payload: BusinessProfilePayload) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: payload.business_name,
      phone: payload.phone,
      location_address: buildLegacyLocationAddress(payload)
    })
    .eq('id', userId)

  if (error) {
    console.warn('[business_profiles] Failed to sync legacy profile fields:', error.message)
  }
}

export async function getMyBusinessProfile(): Promise<BusinessProfileData> {
  noStore()

  const profile = await requireProfile()
  const [row, legacy] = await Promise.all([
    ensureMyBusinessProfileRow(profile.id),
    getLegacyProfileRow(profile.id)
  ])

  return mapBusinessProfile(row, profile.id, legacy)
}

export async function upsertMyBusinessProfile(payload: BusinessProfileInput): Promise<UpsertBusinessProfileResult> {
  const profile = await requireProfile()
  const parsed = validateBusinessProfilePayload(payload, { requireMinimumFields: true })

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.errors[0] || 'Business profile is invalid.',
      errors: parsed.errors
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('business_profiles')
    .upsert(
      {
        user_id: profile.id,
        ...parsed.data,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single()

  if (error) {
    console.error('[business_profiles] Upsert failed:', error)
    return {
      success: false,
      message: 'Failed to save business profile.',
      errors: [error.message]
    }
  }

  await syncLegacyProfileFields(profile.id, parsed.data)
  const legacy = await getLegacyProfileRow(profile.id)
  const merged = mapBusinessProfile(data as BusinessProfileRow, profile.id, legacy)

  return {
    success: true,
    message: 'Business profile saved.',
    profile: merged
  }
}

export async function getVendorBusinessProfileForInvoice(
  vendorId: string,
  context: VendorProfileLookupContext = {}
): Promise<BusinessProfileData | null> {
  noStore()

  const actor = await requireProfile()
  const supabase = await createClient()

  if (actor.role === 'vendor') {
    if (actor.id !== vendorId) return null
    const [row, legacy] = await Promise.all([
      loadBusinessProfileRow(vendorId),
      getLegacyProfileRow(vendorId)
    ])
    return mapBusinessProfile(row, vendorId, legacy)
  }

  if (actor.role !== 'distributor') {
    return null
  }

  if (context.distributorId && context.distributorId !== actor.id) {
    return null
  }

  let hasRelationship = false

  if (context.orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('id', context.orderId)
      .eq('distributor_id', actor.id)
      .eq('vendor_id', vendorId)
      .limit(1)

    if (error) throw new Error(`Failed to verify order relationship: ${error.message}`)
    hasRelationship = (data ?? []).length > 0
  }

  if (!hasRelationship && context.invoiceId) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', context.invoiceId)
      .eq('distributor_id', actor.id)
      .eq('vendor_id', vendorId)
      .limit(1)

    if (error) throw new Error(`Failed to verify invoice relationship: ${error.message}`)
    hasRelationship = (data ?? []).length > 0
  }

  if (!hasRelationship) {
    const { data, error } = await supabase
      .from('distributor_vendors')
      .select('vendor_id')
      .eq('distributor_id', actor.id)
      .eq('vendor_id', vendorId)
      .limit(1)

    if (error) throw new Error(`Failed to verify link relationship: ${error.message}`)
    hasRelationship = (data ?? []).length > 0
  }

  if (!hasRelationship) {
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('distributor_id', actor.id)
      .eq('vendor_id', vendorId)
      .limit(1)

    if (error) throw new Error(`Failed to verify distributor/vendor order history: ${error.message}`)
    hasRelationship = (data ?? []).length > 0
  }

  if (!hasRelationship) {
    return null
  }

  const [row, legacy] = await Promise.all([
    loadBusinessProfileRow(vendorId),
    getLegacyProfileRow(vendorId)
  ])
  return mapBusinessProfile(row, vendorId, legacy)
}
