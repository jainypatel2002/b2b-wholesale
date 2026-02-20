import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

export async function getDistributorContext() {
  const profile = await requireProfile()
  if (profile.role !== 'distributor') throw new Error('Not distributor')
  return { distributorId: profile.id, profile }
}

export async function getVendorContext(options: { strict?: boolean } = { strict: true }) {
  const profile = await requireProfile()
  if (profile.role !== 'vendor') throw new Error('Not vendor')

  const supabase = await createClient()

  // 1. Fetch available links
  const { data: links } = await supabase
    .from('distributor_vendors')
    .select('distributor_id')
    .eq('vendor_id', profile.id)

  const linkedDistributorIds = (links || []).map((l: any) => l.distributor_id)

  // 2. Resolve Active Distributor
  let activeDistributorId = profile.active_distributor_id

  // If active ID is designated but not linked anymore (or invalid), reset it
  if (activeDistributorId && !linkedDistributorIds.includes(activeDistributorId)) {
    activeDistributorId = null
  }

  // If no active ID, pick the first one (auto-select default)
  if (!activeDistributorId && linkedDistributorIds.length > 0) {
    activeDistributorId = linkedDistributorIds[0]

    // Auto-heal: Save this preference to profile so it sticks
    // Fire-and-forget update (ok in server component context usually, but awaited to be safe)
    await supabase.from('profiles').update({ active_distributor_id: activeDistributorId }).eq('id', profile.id)
  }

  // 3. Return Context
  // If still no activeDistributorId, it means user has NO links.
  if (!activeDistributorId) {
    if (options.strict) throw new Error('Vendor is not linked to any distributor')
    return { vendorId: profile.id, distributorId: null, profile }
  }

  return { vendorId: profile.id, distributorId: activeDistributorId, profile }
}

export async function getLinkedVendors(distributorId: string) {
  const supabase = await createClient()
  const { data: vendors } = await supabase
    .from('distributor_vendors')
    .select('vendor_id, vendor:profiles!vendor_id(id, display_name, email)')
    .eq('distributor_id', distributorId)

  // Format as simple array of options
  return (vendors || [])
    .map((v: any) => ({
      id: v.vendor.id,
      name: v.vendor.display_name || v.vendor.email || 'Unknown Vendor'
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
