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
  const { data: link } = await supabase
    .from('distributor_vendors')
    .select('distributor_id')
    .eq('vendor_id', profile.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!link?.distributor_id) {
    if (options.strict) throw new Error('Vendor is not linked to any distributor')
    return { vendorId: profile.id, distributorId: null, profile }
  }

  return { vendorId: profile.id, distributorId: link.distributor_id, profile }
}
