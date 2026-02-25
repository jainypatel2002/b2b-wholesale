'use server'

import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIST_CODE_REGEX = /^DIST-[A-Z0-9]{4,}$/

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type SavedDistributorSettingsItem = {
  id: string
  distributorName: string
  distributorCode: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  linked: boolean
  linkedDistributorId: string | null
  linkedDistributorName: string | null
}

type ConnectDistributorResult = {
  success: boolean
  message: string
  code?: string
  distributorId?: string
  distributorName?: string
  linked?: boolean
  alreadyLinked?: boolean
  normalizedCode?: string
}

function normalizeDistributorCode(input: string) {
  return input.replace(/\s+/g, '').toUpperCase()
}

function getDistributorName(distributor: { display_name: string | null; email: string | null }) {
  return distributor.display_name || distributor.email || 'Distributor'
}

function revalidateVendorViews() {
  revalidatePath('/vendor')
  revalidatePath('/vendor/catalog')
  revalidatePath('/vendor/settings')
}

function parseDistributorIdentifier(raw: string, allowUuid: boolean) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false as const, code: 'EMPTY', message: 'Distributor code is required.' }
  }

  if (allowUuid && UUID_REGEX.test(trimmed)) {
    return { ok: true as const, isUuid: true as const, value: trimmed }
  }

  const normalized = normalizeDistributorCode(trimmed)
  if (!DIST_CODE_REGEX.test(normalized)) {
    return {
      ok: false as const,
      code: 'INVALID_CODE_FORMAT',
      message: 'Distributor code must match DIST-XXXX.'
    }
  }

  return { ok: true as const, isUuid: false as const, value: normalized }
}

async function resolveDistributor(
  supabase: SupabaseClient,
  identifier: string,
  isUuid: boolean
) {
  let query = supabase
    .from('profiles')
    .select('id, role, display_name, email, distributor_code')
    .eq('role', 'distributor')

  query = isUuid ? query.eq('id', identifier) : query.eq('distributor_code', identifier)

  const { data: distributor, error } = await query.maybeSingle()

  if (error) {
    console.error('resolveDistributor error', error)
    return {
      ok: false as const,
      code: 'LOOKUP_FAILED',
      message: 'Failed to validate distributor code. Please try again.'
    }
  }

  if (!distributor) {
    let inactiveProfile: { id: string; role: string | null } | null = null

    if (isUuid) {
      const { data } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', identifier)
        .maybeSingle()
      inactiveProfile = data
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('distributor_code', identifier)
        .maybeSingle()
      inactiveProfile = data
    }

    if (inactiveProfile && inactiveProfile.role !== 'distributor') {
      return {
        ok: false as const,
        code: 'INACTIVE',
        message: 'Distributor inactive.'
      }
    }

    return {
      ok: false as const,
      code: 'NOT_FOUND',
      message: isUuid ? 'Invalid distributor UUID.' : 'No distributor found for this code.'
    }
  }

  return { ok: true as const, distributor }
}

async function connectVendorToDistributor(params: {
  supabase: SupabaseClient
  vendorId: string
  identifier: string
  isUuid: boolean
}): Promise<ConnectDistributorResult> {
  const { supabase, vendorId, identifier, isUuid } = params

  const resolved = await resolveDistributor(supabase, identifier, isUuid)
  if (!resolved.ok) {
    return { success: false, code: resolved.code, message: resolved.message }
  }

  const distributor = resolved.distributor
  if (distributor.id === vendorId) {
    return { success: false, code: 'SELF_LINK', message: 'Cannot connect to yourself.' }
  }

  const { data: existingLink, error: linkLookupError } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('vendor_id', vendorId)
    .eq('distributor_id', distributor.id)
    .maybeSingle()

  if (linkLookupError) {
    console.error('Link lookup error', linkLookupError)
    return {
      success: false,
      code: 'LINK_LOOKUP_FAILED',
      message: 'Failed to check existing link. Please try again.'
    }
  }

  const alreadyLinked = Boolean(existingLink)

  if (!alreadyLinked) {
    const { error: linkError } = await supabase
      .from('distributor_vendors')
      .insert({ vendor_id: vendorId, distributor_id: distributor.id })

    if (linkError && linkError.code !== '23505') {
      console.error('Link insert error', linkError)
      return {
        success: false,
        code: 'LINK_FAILED',
        message: 'Failed to link distributor. Please try again.'
      }
    }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ active_distributor_id: distributor.id })
    .eq('id', vendorId)

  if (updateError) {
    console.error('Update active distributor error', updateError)
    return {
      success: false,
      code: 'ACTIVE_UPDATE_FAILED',
      message: 'Connected, but failed to switch active distributor.'
    }
  }

  const distributorName = getDistributorName(distributor)

  return {
    success: true,
    message: alreadyLinked
      ? `${distributorName} is already linked.`
      : `Connected to ${distributorName}`,
    distributorId: distributor.id,
    distributorName,
    linked: !alreadyLinked,
    alreadyLinked,
    normalizedCode: normalizeDistributorCode(distributor.distributor_code || identifier)
  }
}

async function touchSavedCodeLastUsed(
  supabase: SupabaseClient,
  vendorId: string,
  distributorCode: string
) {
  const { error } = await supabase
    .from('vendor_saved_distributor_codes')
    .update({ last_used_at: new Date().toISOString() })
    .eq('vendor_id', vendorId)
    .eq('distributor_code', distributorCode)

  if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
    console.error('Failed to update last_used_at for saved distributor code', error)
  }
}

export async function connectDistributor(formData: FormData) {
  const rawIdentifier = String(formData.get('code') || '')
  const parsed = parseDistributorIdentifier(rawIdentifier, true)
  if (!parsed.ok) {
    return { success: false, code: parsed.code, message: parsed.message }
  }

  const { vendorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  const result = await connectVendorToDistributor({
    supabase,
    vendorId,
    identifier: parsed.value,
    isUuid: parsed.isUuid
  })

  if (result.success && !parsed.isUuid) {
    await touchSavedCodeLastUsed(supabase, vendorId, parsed.value)
    revalidateVendorViews()
  } else if (result.success) {
    revalidateVendorViews()
  }

  return result
}

export async function connectDistributorByCode(distributorCode: string) {
  const parsed = parseDistributorIdentifier(distributorCode, false)
  if (!parsed.ok) {
    return { success: false, code: parsed.code, message: parsed.message }
  }

  const { vendorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  const result = await connectVendorToDistributor({
    supabase,
    vendorId,
    identifier: parsed.value,
    isUuid: false
  })

  if (result.success) {
    await touchSavedCodeLastUsed(supabase, vendorId, parsed.value)
    revalidateVendorViews()
  }

  return result
}

export async function saveVendorSavedDistributorCode(input: {
  distributorName: string
  distributorCode: string
}) {
  const distributorName = String(input.distributorName || '').trim()
  if (!distributorName) {
    return { success: false, code: 'NAME_REQUIRED', message: 'Distributor name is required.' }
  }

  const parsed = parseDistributorIdentifier(input.distributorCode, false)
  if (!parsed.ok) {
    return { success: false, code: parsed.code, message: parsed.message }
  }

  const { vendorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vendor_saved_distributor_codes')
    .insert({
      vendor_id: vendorId,
      distributor_name: distributorName,
      distributor_code: parsed.value
    })
    .select('id, distributor_name, distributor_code, created_at, updated_at, last_used_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { success: false, code: 'DUPLICATE', message: 'Already saved.' }
    }

    if (error.code === '42P01') {
      return {
        success: false,
        code: 'TABLE_MISSING',
        message: 'Saved distributors feature is not available yet.'
      }
    }

    console.error('Failed to save distributor code', error)
    return { success: false, code: 'SAVE_FAILED', message: 'Failed to save distributor code.' }
  }

  const { data: linkedRows } = await supabase
    .from('distributor_vendors')
    .select('distributor_id, distributor:profiles!distributor_id(id, display_name, email, distributor_code)')
    .eq('vendor_id', vendorId)

  let linkedDistributorId: string | null = null
  let linkedDistributorName: string | null = null
  let linked = false

  for (const row of linkedRows || []) {
    const distributor = (row as any).distributor
    const linkedCode = normalizeDistributorCode(String(distributor?.distributor_code || ''))
    if (linkedCode === parsed.value) {
      linked = true
      linkedDistributorId = String(distributor?.id || (row as any).distributor_id || '') || null
      linkedDistributorName = getDistributorName({
        display_name: distributor?.display_name || null,
        email: distributor?.email || null
      })
      break
    }
  }

  const item: SavedDistributorSettingsItem = {
    id: data.id,
    distributorName: data.distributor_name,
    distributorCode: data.distributor_code,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    lastUsedAt: data.last_used_at,
    linked,
    linkedDistributorId,
    linkedDistributorName
  }

  revalidatePath('/vendor/settings')
  return { success: true, message: 'Saved.', item }
}

export async function deleteVendorSavedDistributorCode(savedCodeId: string) {
  const id = String(savedCodeId || '').trim()
  if (!id) {
    return { success: false, code: 'MISSING_ID', message: 'Saved distributor id is required.' }
  }

  const { vendorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  const { error } = await supabase
    .from('vendor_saved_distributor_codes')
    .delete()
    .eq('id', id)
    .eq('vendor_id', vendorId)

  if (error) {
    if (error.code === '42P01') {
      return {
        success: false,
        code: 'TABLE_MISSING',
        message: 'Saved distributors feature is not available yet.'
      }
    }

    console.error('Failed to delete saved distributor code', error)
    return { success: false, code: 'DELETE_FAILED', message: 'Failed to delete saved code.' }
  }

  revalidatePath('/vendor/settings')
  return { success: true }
}

export async function switchDistributor(distributorId: string) {
  const { vendorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  const { data: link, error: linkError } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('vendor_id', vendorId)
    .eq('distributor_id', distributorId)
    .maybeSingle()

  if (linkError) {
    console.error('Switch link lookup failed', linkError)
    return { success: false, code: 'LINK_LOOKUP_FAILED', message: 'Failed to validate distributor link.' }
  }

  if (!link) {
    return { success: false, code: 'NOT_LINKED', message: 'You are not linked to this distributor.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active_distributor_id: distributorId })
    .eq('id', vendorId)

  if (error) {
    console.error('Failed to switch distributor', error)
    return { success: false, code: 'UPDATE_FAILED', message: 'Failed to update active distributor.' }
  }

  revalidateVendorViews()
  return { success: true }
}
