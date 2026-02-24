'use server'

import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { createOrder, type CreateOrderItemInput } from '@/lib/orders/create-order'

interface DistributorCreateOrderInput {
  vendorId: string
  items: CreateOrderItemInput[]
}

export async function fetchVendorOrderOverrides(vendorId: string) {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  if (!vendorId) {
    return { ok: false, error: 'Vendor is required', overrides: [] as any[] }
  }

  const { data: link } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)
    .limit(1)
    .maybeSingle()

  if (!link) {
    return { ok: false, error: 'Vendor is not linked to this distributor', overrides: [] as any[] }
  }

  const { data, error } = await supabase
    .from('vendor_price_overrides')
    .select('product_id, price_per_unit, price_per_case')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)

  if (error) {
    return { ok: false, error: error.message, overrides: [] as any[] }
  }

  return { ok: true, overrides: data ?? [] }
}

export async function createDistributorOrderAction(input: DistributorCreateOrderInput) {
  const { distributorId, profile } = await getDistributorContext()
  const supabase = await createClient()

  const vendorId = String(input?.vendorId || '').trim()
  const items = Array.isArray(input?.items) ? input.items : []

  if (!vendorId) {
    return { ok: false, error: 'Vendor is required' }
  }
  if (!items.length) {
    return { ok: false, error: 'Add at least one item before creating the order' }
  }

  const { data: link } = await supabase
    .from('distributor_vendors')
    .select('vendor_id')
    .eq('distributor_id', distributorId)
    .eq('vendor_id', vendorId)
    .limit(1)
    .maybeSingle()

  if (!link) {
    return { ok: false, error: 'Selected vendor is not linked to your account' }
  }

  const result = await createOrder({
    supabase,
    distributorId,
    vendorId,
    items,
    createdByUserId: profile.id,
    createdByRole: 'distributor',
    createdSource: 'distributor_portal',
    allowCatalogRecovery: false
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      invalidItems: result.invalidItems,
      details: result.details
    }
  }

  revalidatePath('/distributor/orders')
  revalidatePath(`/distributor/orders/${result.orderId}`)
  revalidatePath('/vendor/orders', 'layout')

  return { ok: true, orderId: result.orderId }
}
