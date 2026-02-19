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

export async function deleteProduct(productId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // Soft delete
    const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('distributor_id', distributorId)

    if (error) throw error
    revalidatePath('/distributor/inventory')
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
        const subcategory_id = String(formData.get('subcategory_id') || '').trim() || null

        const cost_price = Number(formData.get('cost_price') || 0)
        const sell_price = Number(formData.get('sell_price') || 0)

        // Extended pricing fields
        const cost_case = Number(formData.get('cost_case') || 0)
        const price_case = Number(formData.get('price_case') || 0)
        const cost_mode = String(formData.get('cost_mode') || 'unit')
        const price_mode = String(formData.get('price_mode') || 'unit')
        const stock_mode = String(formData.get('stock_mode') || 'pieces')

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
            subcategory_id,
            name,
            sku,
            cost_price,
            sell_price,
            cost_case,
            price_case,
            cost_mode,
            price_mode,
            stock_qty: stock_pieces,    // Sync legacy
            stock_pieces,               // Canonical
            stock_mode,                 // Preference
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
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const id = String(formData.get('id'))
        const name = String(formData.get('name') || '').trim()
        const sku = String(formData.get('sku') || '').trim() || null
        const category_id = String(formData.get('category_id') || '').trim() || null
        const subcategory_id = String(formData.get('subcategory_id') || '').trim() || null

        const cost_price = Number(formData.get('cost_price') || 0)
        const sell_price = Number(formData.get('sell_price') || 0)

        // Extended pricing fields
        const cost_case = Number(formData.get('cost_case') || 0)
        const price_case = Number(formData.get('price_case') || 0)
        const cost_mode = String(formData.get('cost_mode') || 'unit')
        const price_mode = String(formData.get('price_mode') || 'unit')
        const stock_mode = String(formData.get('stock_mode') || 'pieces')

        const stock_pieces = Number(formData.get('stock_qty') || 0)
        const allow_case = formData.get('allow_case') === 'on'
        const allow_piece = formData.get('allow_piece') === 'on'
        const units_per_case = Number(formData.get('units_per_case') || 1)
        const low_stock_threshold = Number(formData.get('low_stock_threshold') || 5)

        if (!id) return { error: 'Product ID required' }
        if (!name) return { error: 'Product name required' }
        if (allow_case && units_per_case < 2) return { error: 'Units per case must be > 1' }
        if (!allow_case && !allow_piece) return { error: 'Must allow at least cases or pieces' }

        const { error } = await supabase
            .from('products')
            .update({
                name,
                sku,
                category_id,
                subcategory_id,
                cost_price,
                sell_price,
                cost_case,
                price_case,
                cost_mode,
                price_mode,
                stock_qty: stock_pieces,
                stock_pieces,
                stock_mode,
                allow_case,
                allow_piece,
                units_per_case: allow_case ? units_per_case : null,
                low_stock_threshold
            })
            .eq('id', id)
            .eq('distributor_id', distributorId)

        if (error) {
            console.error('updateProductAction Error:', error)
            return { error: error.message }
        }

        revalidatePath('/distributor/inventory')
        return { success: true, error: null }
    } catch (e: any) {
        console.error('updateProductAction Exception:', e)
        return { error: e.message || 'An unexpected error occurred' }
    }
}
