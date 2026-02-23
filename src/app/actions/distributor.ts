'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeInvoiceSubtotal } from '@/lib/pricing-engine'

export async function updateOrderStatus(orderId: string, newStatus: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const validStatuses = ['placed', 'accepted', 'fulfilled', 'cancelled']
    if (!validStatuses.includes(newStatus)) {
        return { error: 'Invalid status' }
    }

    const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .eq('distributor_id', distributorId)

    if (error) return { error: error.message }

    revalidatePath('/distributor/orders')
    revalidatePath(`/distributor/orders/${orderId}`)
    return { success: true }
}

// ── Edit Order Items Before Invoice ─────────────────────────────────

interface OrderItemEdit {
    order_item_id: string
    edited_name?: string | null
    edited_unit_price?: number | null
    edited_qty?: number | null
    removed?: boolean
}

export async function updateOrderItemsAction(orderId: string, items: OrderItemEdit[]) {
    const { distributorId, profile } = await getDistributorContext()
    const supabase = await createClient()

    // 1. Verify distributor owns order
    const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .eq('distributor_id', distributorId)
        .single()

    if (orderErr || !order) {
        return { error: 'Order not found or access denied' }
    }

    // 2. Check no invoice exists (order is not locked)
    const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle()

    if (existingInvoice) {
        return { error: 'Order is locked — invoice already generated' }
    }

    // 3. Validate each item
    if (!items.length) {
        return { error: 'No items to update' }
    }

    for (const item of items) {
        if (!item.order_item_id) {
            return { error: 'Missing order_item_id' }
        }
        if (item.edited_name !== undefined && item.edited_name !== null && item.edited_name.trim() === '') {
            return { error: 'Item name cannot be empty' }
        }
        if (item.edited_unit_price !== undefined && item.edited_unit_price !== null && item.edited_unit_price < 0) {
            return { error: 'Price cannot be negative' }
        }
        if (item.edited_qty !== undefined && item.edited_qty !== null && item.edited_qty <= 0) {
            return { error: 'Quantity must be greater than zero' }
        }
    }

    // 4. Verify all items belong to this order
    const itemIds = items.map(i => i.order_item_id)
    const { data: existingItems, error: itemsErr } = await supabase
        .from('order_items')
        .select('id')
        .eq('order_id', orderId)
        .in('id', itemIds)

    if (itemsErr) {
        return { error: `Failed to verify items: ${itemsErr.message}` }
    }

    const existingIds = new Set((existingItems ?? []).map((i: any) => i.id))
    const invalidIds = itemIds.filter(id => !existingIds.has(id))
    if (invalidIds.length > 0) {
        return { error: `Items do not belong to this order: ${invalidIds.join(', ')}` }
    }

    // 5. Bulk update each item
    const now = new Date().toISOString()
    let updatedCount = 0

    for (const item of items) {
        const updateData: Record<string, any> = {
            edited_at: now,
            edited_by: profile.id,
        }

        if (item.edited_name !== undefined) updateData.edited_name = item.edited_name
        if (item.edited_unit_price !== undefined) updateData.edited_unit_price = item.edited_unit_price
        if (item.edited_qty !== undefined) updateData.edited_qty = item.edited_qty
        if (item.removed !== undefined) updateData.removed = item.removed

        const { error: updateErr } = await supabase
            .from('order_items')
            .update(updateData)
            .eq('id', item.order_item_id)
            .eq('order_id', orderId)

        if (updateErr) {
            console.error(`[updateOrderItemsAction] Failed to update item ${item.order_item_id}:`, updateErr)
            return { error: `Failed to update item: ${updateErr.message}` }
        }
        updatedCount++
    }

    // 6. Compute new effective total
    const { data: allItems } = await supabase
        .from('order_items')
        .select('qty, unit_price, edited_qty, edited_unit_price, removed')
        .eq('order_id', orderId)

    const newTotal = computeInvoiceSubtotal(allItems ?? [])

    revalidatePath(`/distributor/orders/${orderId}`)
    revalidatePath('/distributor/orders')
    return { success: true, updated_count: updatedCount, new_total: newTotal }
}

export async function createInvoiceAction(orderId: string) {
    await getDistributorContext()
    const supabase = await createClient()

    console.log('[createInvoiceAction] ATOMIC-V2 starting for order:', orderId)
    console.log('[createInvoiceAction] __filename:', typeof __filename !== 'undefined' ? __filename : 'unknown')

    // Call the database function that handles validation + snapshots + locking in one transaction
    const { data: invoiceId, error } = await supabase.rpc('generate_invoice', {
        p_order_id: orderId
    })

    if (error) {
        console.error('[createInvoiceAction] RPC Error:', error)
        return { error: error.message }
    }

    if (!invoiceId) {
        console.error('[createInvoiceAction] RPC returned no ID')
        return { error: 'Failed to generate invoice: No ID returned' }
    }

    console.log('[createInvoiceAction] Success! Created/Found Invoice:', invoiceId)

    // Revalidate relevant views aggressively
    revalidatePath('/distributor/orders')
    revalidatePath(`/distributor/orders/${orderId}`)
    revalidatePath('/distributor/invoices')
    revalidatePath(`/distributor/invoices/${invoiceId}`)
    revalidatePath('/', 'layout')

    return { success: true, invoiceId }
}

export async function markInvoicePaid(invoiceId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const { error } = await supabase
        .from('invoices')
        .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', invoiceId)
        .eq('distributor_id', distributorId)

    if (error) return { error: error.message }

    revalidatePath('/distributor/invoices')
    revalidatePath(`/distributor/invoices/${invoiceId}`)
    // Also revalidate order pages since they might show payment status
    revalidatePath('/distributor/orders')
    return { success: true }
}

export async function updateProduct(formData: FormData) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()
    const parseNumber = (raw: FormDataEntryValue | null): number | null => {
        if (raw === null || raw === undefined || raw === '') return null
        const n = Number(raw)
        return Number.isFinite(n) ? n : null
    }

    const id = String(formData.get('id'))
    const name = String(formData.get('name') || '').trim()
    const sku = String(formData.get('sku') || '').trim() || null
    const category_id = String(formData.get('category_id') || '').trim() || null

    const cost_price = parseNumber(formData.get('cost_price'))
    const sell_price = parseNumber(formData.get('sell_price'))

    // New fields
    const stock_pieces = parseNumber(formData.get('stock_qty')) // Map stock entry to pieces
    const allow_case = formData.get('allow_case') === 'on'
    const allow_piece = formData.get('allow_piece') === 'on'
    const units_per_case = parseNumber(formData.get('units_per_case')) ?? 1
    const low_stock_threshold = parseNumber(formData.get('low_stock_threshold')) ?? 5

    if (!id) return { error: 'Product ID required' }
    if (!name) return { error: 'Product name required' }
    if (sell_price === null || cost_price === null || stock_pieces === null) return { error: 'Invalid numeric input' }
    if (allow_case && units_per_case < 2) return { error: 'Units per case must be > 1' }
    if (!allow_case && !allow_piece) return { error: 'Must allow at least cases or pieces' }

    const { error } = await supabase
        .from('products')
        .update({
            name,
            sku,
            category_id,
            cost_price,
            sell_price,
            stock_qty: stock_pieces,    // Sync legacy
            stock_pieces,               // Canonical
            allow_case,
            allow_piece,
            units_per_case: allow_case ? units_per_case : null,
            low_stock_threshold
        })
        .eq('id', id)
        .eq('distributor_id', distributorId)

    if (error) return { error: error.message }

    revalidatePath('/distributor/inventory')
    return { success: true }
}

export async function fulfillOrderAction(orderId: string) {
    const supabase = await createClient()

    const { error } = await supabase.rpc('fulfill_order', { p_order_id: orderId })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/distributor/orders')
    revalidatePath(`/distributor/orders/${orderId}`)
    revalidatePath('/distributor/inventory') // Inventory changes, so refresh this too
    return { success: true }
}

// ── Manual Adjustments and Taxes ─────────────────────────────────

export async function addOrderAdjustmentAction(orderId: string, name: string, amount: number) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // Ensure order belongs to distributor
    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).eq('distributor_id', distributorId).single()
    if (!order) return { error: 'Order not found' }

    if (!name.trim()) return { error: 'Name is required' }

    const { error } = await supabase.from('order_adjustments').insert({ order_id: orderId, name, amount })
    if (error) return { error: error.message }

    revalidatePath(`/distributor/orders/${orderId}`)
    return { success: true }
}

export async function removeOrderAdjustmentAction(orderId: string, adjustmentId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).eq('distributor_id', distributorId).single()
    if (!order) return { error: 'Order not found' }

    const { error } = await supabase.from('order_adjustments').delete().eq('id', adjustmentId).eq('order_id', orderId)
    if (error) return { error: error.message }

    revalidatePath(`/distributor/orders/${orderId}`)
    return { success: true }
}

export async function addOrderTaxAction(orderId: string, name: string, type: 'percent' | 'fixed', rate_percent: number) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).eq('distributor_id', distributorId).single()
    if (!order) return { error: 'Order not found' }

    if (!name.trim()) return { error: 'Tax name is required' }
    if (rate_percent < 0) return { error: 'Rate cannot be negative' }

    const { error } = await supabase.from('order_taxes').insert({ order_id: orderId, name, type, rate_percent })
    if (error) return { error: error.message }

    revalidatePath(`/distributor/orders/${orderId}`)
    return { success: true }
}

export async function removeOrderTaxAction(orderId: string, taxId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).eq('distributor_id', distributorId).single()
    if (!order) return { error: 'Order not found' }

    const { error } = await supabase.from('order_taxes').delete().eq('id', taxId).eq('order_id', orderId)
    if (error) return { error: error.message }

    revalidatePath(`/distributor/orders/${orderId}`)
    return { success: true }
}
