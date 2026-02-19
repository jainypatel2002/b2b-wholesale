'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { updateProduct as originalUpdateProduct } from '@/app/actions/distributor'

export type InventoryActionState = {
    success?: boolean
    error?: string | null
    details?: any
}

export async function createProductAction(
    prevState: InventoryActionState,
    formData: FormData
): Promise<InventoryActionState> {
    try {
        const { distributorId } = await getDistributorContext()
        const name = String(formData.get('name') || '').trim()
        const sku = String(formData.get('sku') || '').trim() || null
        const category_id = String(formData.get('category_id') || '').trim() || null

        const cost_price = Number(formData.get('cost_price') || 0)
        const sell_price = Number(formData.get('sell_price') || 0)

        const stock_pieces = Number(formData.get('stock_qty') || 0)
        const allow_case = formData.get('allow_case') === 'on'
        const allow_piece = formData.get('allow_piece') === 'on'
        const units_per_case = Number(formData.get('units_per_case') || 1)
        const low_stock_threshold = Number(formData.get('low_stock_threshold') || 5)

        if (!name) return { error: 'Product name required' }
        if (allow_case && units_per_case < 2) return { error: 'Units per case must be > 1' }
        if (!allow_case && !allow_piece) return { error: 'Must allow at least cases or pieces' }

        const supabase = await createClient()
        const { error } = await supabase.from('products').insert({
            distributor_id: distributorId,
            category_id,
            name,
            sku,
            cost_price,
            sell_price,
            stock_qty: stock_pieces,    // Sync legacy
            stock_pieces,               // Canonical
            allow_case,
            allow_piece,
            units_per_case: allow_case ? units_per_case : null,
            low_stock_threshold
        })

        if (error) {
            console.error('createProductAction Supabase Error:', error)
            return { error: error.message, details: error }
        }

        revalidatePath('/distributor/inventory')
        return { success: true, error: null }
    } catch (e: any) {
        console.error('createProductAction Exception:', e)
        return { error: e.message || 'An unexpected error occurred' }
    }
}

export async function updateProductAction(
    prevState: InventoryActionState,
    formData: FormData
): Promise<InventoryActionState> {
    try {
        // We wrap the existing updateProduct to adapt to useFormState signature
        // and catch any unexpected throws
        const result = await originalUpdateProduct(formData)

        if (result.error) {
            return { error: result.error }
        }

        return { success: true, error: null }
    } catch (e: any) {
        console.error('updateProductAction Exception:', e)
        return { error: e.message || 'An unexpected error occurred' }
    }
}
