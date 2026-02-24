'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { parseNumericInput } from '@/lib/pricing/priceValidation'

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

        const parsedPrice = parseNumericInput(priceDollars, 'Override price', {
            allowNegative: false,
            roundTo: 2
        })
        if (!parsedPrice.ok) {
            return { ok: false, error: parsedPrice.error }
        }

        const priceCents = Math.round(parsedPrice.value * 100)

        const { error } = await supabase
            .from('vendor_price_overrides')
            .upsert({
                distributor_id: distributorId,
                vendor_id: vendorId,
                product_id: productId,
                price_per_unit: parsedPrice.value,
                price_cents: priceCents, // Keep legacy synced
                updated_at: new Date().toISOString()
            }, { onConflict: 'distributor_id, vendor_id, product_id' })

        if (error) throw error

        revalidatePath('/distributor/vendor-pricing')
        revalidatePath('/vendor/catalog', 'layout')
        revalidatePath('/vendor/cart', 'layout')
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
        revalidatePath('/vendor/catalog', 'layout')
        revalidatePath('/vendor/cart', 'layout')
        return { ok: true }
    } catch (e: any) {
        console.error("Remove override error:", e)
        return { ok: false, error: e.message }
    }
}
