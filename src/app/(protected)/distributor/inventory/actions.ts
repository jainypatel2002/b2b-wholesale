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
        const barcode = String(formData.get('barcode') || '').trim() || null
        const category_id = String(formData.get('category_id') || '').trim() || null
        const category_node_id = String(formData.get('category_node_id') || '').trim() || null

        const cost_price = Number(formData.get('cost_price') || 0)
        const sell_price = Number(formData.get('sell_price') || 0)

        // Extended pricing fields
        const cost_case = Number(formData.get('cost_case') || 0)
        const price_case = Number(formData.get('price_case') || 0)
        const cost_mode = String(formData.get('cost_mode') || 'unit')
        const price_mode = String(formData.get('price_mode') || 'unit')
        const stock_mode = String(formData.get('stock_mode') || 'pieces')

        const stock_pieces = Number(formData.get('stock_qty') || 0)

        const stock_locked = formData.get('stock_locked') === 'true' || formData.get('stock_locked') === 'on'
        const locked_stock_qty_raw = formData.get('locked_stock_qty')
        const locked_stock_qty = stock_locked && locked_stock_qty_raw ? Number(locked_stock_qty_raw) : null
        const final_stock_pieces = stock_locked && locked_stock_qty !== null ? locked_stock_qty : stock_pieces

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
            category_node_id,
            name,
            sku,
            barcode,
            cost_price,
            sell_price,
            cost_mode,
            price_mode,
            stock_qty: final_stock_pieces,    // Sync legacy
            stock_pieces: final_stock_pieces,               // Canonical
            stock_mode,                 // Preference
            stock_locked,
            locked_stock_qty,
            allow_case,
            allow_piece,
            units_per_case: allow_case ? units_per_case : null,
            low_stock_threshold
        })

        if (error) {
            console.error('createProductAction Supabase Error:', error)
            if (error.message?.includes('products_distributor_barcode_uniq') || error.code === '23505' && error.message?.includes('barcode')) {
                return { error: 'This barcode is already assigned to another product in your inventory.' }
            }
            if (error.message?.includes('schema cache') || error.message?.includes('Could not find')) {
                return { error: 'Database schema is updating. Please apply the latest migration in Supabase SQL Editor and reload the schema cache (Settings → API → Reload), then try again.' }
            }
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
        const barcode = String(formData.get('barcode') || '').trim() || null
        const category_id = String(formData.get('category_id') || '').trim() || null
        const category_node_id = String(formData.get('category_node_id') || '').trim() || null

        // Safe number parser: returns undefined for empty/missing values
        // This prevents overwriting existing DB values with 0
        const safeNum = (key: string): number | undefined => {
            const raw = formData.get(key)
            if (raw === null || raw === undefined || raw === '') return undefined
            const n = Number(raw)
            return isNaN(n) ? undefined : n
        }

        const sell_price = safeNum('sell_price') ?? 0  // sell_price always required
        const cost_price = safeNum('cost_price')       // preserve existing if empty
        const cost_case = safeNum('cost_case')         // preserve existing if empty
        const price_case = safeNum('price_case')       // preserve existing if empty

        const cost_mode = String(formData.get('cost_mode') || 'unit')
        const price_mode = String(formData.get('price_mode') || 'unit')
        const stock_mode = String(formData.get('stock_mode') || 'pieces')

        const stock_pieces = Number(formData.get('stock_qty') || 0)

        const stock_locked = formData.get('stock_locked') === 'true' || formData.get('stock_locked') === 'on'
        const locked_stock_qty_raw = formData.get('locked_stock_qty')
        const locked_stock_qty = stock_locked && locked_stock_qty_raw ? Number(locked_stock_qty_raw) : null
        const final_stock_pieces = stock_locked && locked_stock_qty !== null ? locked_stock_qty : stock_pieces

        const allow_case = formData.get('allow_case') === 'on'
        const allow_piece = formData.get('allow_piece') === 'on'
        const units_per_case = Number(formData.get('units_per_case') || 1)
        const low_stock_threshold = Number(formData.get('low_stock_threshold') || 5)

        if (!id) return { error: 'Product ID required' }
        if (!name) return { error: 'Product name required' }
        if (allow_case && units_per_case < 2) return { error: 'Units per case must be > 1' }
        if (!allow_case && !allow_piece) return { error: 'Must allow at least cases or pieces' }

        // Build update payload — only include cost/price fields when they have values
        // This prevents bulk pricing (which only updates sell_price) from zeroing cost
        const updatePayload: Record<string, any> = {
            name,
            sku,
            barcode,
            category_id,
            category_node_id,
            sell_price,
            cost_mode,
            price_mode,
            stock_qty: final_stock_pieces,
            stock_pieces: final_stock_pieces,
            stock_mode,
            stock_locked,
            locked_stock_qty,
            allow_case,
            allow_piece,
            units_per_case: allow_case ? units_per_case : null,
            low_stock_threshold
        }

        // Only include cost/price fields if they have real values (not empty/undefined)
        if (cost_price !== undefined) updatePayload.cost_price = cost_price
        if (cost_case !== undefined) updatePayload.cost_case = cost_case
        if (price_case !== undefined) updatePayload.price_case = price_case

        const { error } = await supabase
            .from('products')
            .update(updatePayload)
            .eq('id', id)
            .eq('distributor_id', distributorId)

        if (error) {
            console.error('updateProductAction Error:', error)
            if (error.message?.includes('products_distributor_barcode_uniq') || error.code === '23505' && error.message?.includes('barcode')) {
                return { error: 'This barcode is already assigned to another product in your inventory.' }
            }
            if (error.message?.includes('schema cache') || error.message?.includes('Could not find')) {
                return { error: 'Database schema is updating. Please apply the latest migration in Supabase SQL Editor and reload the schema cache (Settings → API → Reload), then try again.' }
            }
            return { error: error.message }
        }

        revalidatePath('/distributor/inventory')
        return { success: true, error: null }
    } catch (e: any) {
        console.error('updateProductAction Exception:', e)
        return { error: e.message || 'An unexpected error occurred' }
    }
}
