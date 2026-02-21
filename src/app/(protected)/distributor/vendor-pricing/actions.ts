'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

export async function fetchOverrides(vendorId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const { data: overrides, error } = await supabase
        .from('vendor_price_overrides')
        .select('*')
        .eq('distributor_id', distributorId)
        .eq('vendor_id', vendorId)

    if (error) throw error
    return overrides || []
}

export async function saveOverride(vendorId: string, productId: string, priceDollars: number) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        // Validate and convert to integer cents
        if (isNaN(priceDollars) || priceDollars < 0) {
            return { ok: false, error: 'Invalid price amount' }
        }

        const priceCents = Math.round(priceDollars * 100)

        const { error } = await supabase
            .from('vendor_price_overrides')
            .upsert({
                distributor_id: distributorId,
                vendor_id: vendorId,
                product_id: productId,
                price_cents: priceCents,
                updated_at: new Date().toISOString()
            }, { onConflict: 'distributor_id, vendor_id, product_id' })

        if (error) throw error

        revalidatePath('/distributor/vendor-pricing')
        return { ok: true }
    } catch (e: any) {
        console.error("Save override error:", e)
        return { ok: false, error: e.message }
    }
}

export async function removeOverride(vendorId: string, productId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const { error } = await supabase
            .from('vendor_price_overrides')
            .delete()
            .match({
                distributor_id: distributorId,
                vendor_id: vendorId,
                product_id: productId
            })

        if (error) throw error

        revalidatePath('/distributor/vendor-pricing')
        return { ok: true }
    } catch (e: any) {
        console.error("Remove override error:", e)
        return { ok: false, error: e.message }
    }
}

export async function executeBulkAdjustment(
    scope: 'global' | 'category' | 'category_node',
    scopeId: string | null,
    type: 'fixed_cents' | 'percent' | 'overwrite_cents',
    value: number
) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        if (isNaN(value)) return { ok: false, error: "Invalid adjustment value" }

        const { data, error } = await supabase.rpc('execute_bulk_price_adjustment', {
            p_distributor_id: distributorId,
            p_scope: scope,
            p_scope_id: scopeId,
            p_type: type,
            p_value: value
        })

        if (error) throw error

        revalidatePath('/distributor/vendor-pricing')
        revalidatePath('/distributor/inventory')

        return { ok: true, data }
    } catch (e: any) {
        console.error("Execute bulk adjustment error:", e)
        return { ok: false, error: e.message }
    }
}
