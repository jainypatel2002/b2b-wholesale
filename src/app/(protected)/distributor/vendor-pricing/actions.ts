'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { parseNumericInput } from '@/lib/pricing/priceValidation'

type OverridePriceUnit = 'unit' | 'case'

export async function fetchOverrides(vendorId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const { data: overrides, error } = await supabase
        .from('vendor_price_overrides')
        .select('product_id, price_per_unit, price_per_case')
        .eq('distributor_id', distributorId)
        .eq('vendor_id', vendorId)

    if (error) throw error
    return overrides || []
}

export async function saveOverride(
    vendorId: string,
    productId: string,
    priceDollars: number,
    priceUnit?: OverridePriceUnit
) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        if (!vendorId || !productId) {
            return { ok: false, error: 'Vendor and product are required' }
        }

        const parsedPrice = parseNumericInput(priceDollars, 'Override price', {
            allowNegative: false,
            roundTo: 4
        })
        if (!parsedPrice.ok) {
            return { ok: false, error: parsedPrice.error }
        }

        const [{ data: link, error: linkError }, { data: product, error: productError }] = await Promise.all([
            supabase
                .from('distributor_vendors')
                .select('vendor_id')
                .eq('distributor_id', distributorId)
                .eq('vendor_id', vendorId)
                .limit(1)
                .maybeSingle(),
            supabase
                .from('products')
                .select('id, distributor_id, allow_case, units_per_case')
                .eq('id', productId)
                .eq('distributor_id', distributorId)
                .is('deleted_at', null)
                .maybeSingle()
        ])

        if (linkError && linkError.code !== 'PGRST116') {
            throw linkError
        }
        if (!link) {
            return { ok: false, error: 'Vendor is not linked to this distributor' }
        }

        if (productError && productError.code !== 'PGRST116') {
            throw productError
        }
        if (!product) {
            return { ok: false, error: 'Product not found for this distributor' }
        }

        const resolvedUnit: OverridePriceUnit = priceUnit === 'unit' || priceUnit === 'case'
            ? priceUnit
            : (product.allow_case ? 'case' : 'unit')

        const { data: existingRow, error: existingError } = await supabase
            .from('vendor_price_overrides')
            .select('price_per_unit, price_per_case')
            .eq('distributor_id', distributorId)
            .eq('vendor_id', vendorId)
            .eq('product_id', productId)
            .maybeSingle()

        if (existingError && existingError.code !== 'PGRST116') {
            throw existingError
        }

        const existingCasePrice = existingRow?.price_per_case == null ? null : Number(existingRow.price_per_case)

        const nextUnitPrice = resolvedUnit === 'unit' ? parsedPrice.value : null
        const nextCasePrice = resolvedUnit === 'case' ? parsedPrice.value : existingCasePrice
        const unitsPerCase = Math.max(1, Math.floor(Number(product.units_per_case || 1)))

        const centsSourcePrice = nextUnitPrice ?? (nextCasePrice == null ? null : (nextCasePrice / unitsPerCase))
        if (centsSourcePrice == null) {
            return { ok: false, error: 'At least one override value is required' }
        }

        const priceCents = Math.round(centsSourcePrice * 100)

        const { error } = await supabase
            .from('vendor_price_overrides')
            .upsert({
                distributor_id: distributorId,
                vendor_id: vendorId,
                product_id: productId,
                price_per_unit: nextUnitPrice,
                price_per_case: nextCasePrice,
                price_cents: priceCents, // Keep legacy synced (unit cents fallback)
                updated_at: new Date().toISOString()
            }, { onConflict: 'distributor_id, vendor_id, product_id' })

        if (error) throw error

        revalidatePath('/distributor/vendor-pricing')
        revalidatePath('/vendor/catalog', 'layout')
        revalidatePath('/vendor/cart', 'layout')
        return { ok: true, unit: resolvedUnit }
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
