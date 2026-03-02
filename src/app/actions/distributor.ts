'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeInvoiceSubtotal } from '@/lib/pricing-engine'
import { kickEmailWorker } from '@/lib/email/kick-email-worker'

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

    if (newStatus === 'accepted') {
        await kickEmailWorker({
            orderId,
            eventType: 'ORDER_ACCEPTED'
        })
    }

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
    return markInvoiceAsPaidAction(invoiceId)
}

type MarkAsPaidResult = {
    success: boolean
    alreadyPaid?: boolean
    error?: string
}

function normalizePaymentStatus(input: unknown): string {
    const raw = String(input || '').trim().toLowerCase()
    return raw || 'unpaid'
}

export async function markInvoiceAsPaidAction(invoiceId: string): Promise<MarkAsPaidResult> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()
        const now = new Date().toISOString()
        const normalizedInvoiceId = String(invoiceId || '').trim()

        if (!normalizedInvoiceId) {
            return { success: false, error: 'Invoice is required.' }
        }

        const existingResult = await supabase
            .from('invoices')
            .select('id,order_id,payment_status,paid_at')
            .eq('id', normalizedInvoiceId)
            .eq('distributor_id', distributorId)
            .maybeSingle()

        if (existingResult.error) {
            return { success: false, error: existingResult.error.message || 'Failed to load invoice.' }
        }

        if (!existingResult.data) {
            return { success: false, error: 'Invoice not found or access denied.' }
        }

        const alreadyPaid = normalizePaymentStatus(existingResult.data.payment_status) === 'paid'
        const updatePayload: Record<string, unknown> = {
            payment_status: 'paid',
            paid_at: existingResult.data.paid_at || now,
        }

        let updateResult = await supabase
            .from('invoices')
            .update(updatePayload as any)
            .eq('id', normalizedInvoiceId)
            .eq('distributor_id', distributorId)

        if (updateResult.error && updateResult.error.code === '42703') {
            updateResult = await supabase
                .from('invoices')
                .update({ payment_status: 'paid' } as any)
                .eq('id', normalizedInvoiceId)
                .eq('distributor_id', distributorId)
        }

        if (updateResult.error) {
            return { success: false, error: updateResult.error.message || 'Failed to mark invoice as paid.' }
        }

        if (existingResult.data.order_id) {
            const orderUpdatePayload: Record<string, unknown> = {
                payment_status: 'paid',
                paid_at: now,
            }
            let orderUpdateResult = await supabase
                .from('orders')
                .update(orderUpdatePayload as any)
                .eq('id', existingResult.data.order_id)
                .eq('distributor_id', distributorId)

            if (orderUpdateResult.error && orderUpdateResult.error.code === '42703') {
                orderUpdateResult = await supabase
                    .from('orders')
                    .update({ payment_status: 'paid' } as any)
                    .eq('id', existingResult.data.order_id)
                    .eq('distributor_id', distributorId)
            }

            if (orderUpdateResult.error && process.env.NODE_ENV !== 'production') {
                console.error('markInvoiceAsPaidAction: failed to sync order payment status', orderUpdateResult.error)
            }
        }

        revalidatePath('/distributor/invoices')
        revalidatePath(`/distributor/invoices/${normalizedInvoiceId}`)
        revalidatePath('/distributor/orders')
        if (existingResult.data.order_id) {
            revalidatePath(`/distributor/orders/${existingResult.data.order_id}`)
        }

        return { success: true, alreadyPaid }
    } catch (error: any) {
        return { success: false, error: error?.message || 'Failed to mark invoice as paid.' }
    }
}

export async function markOrderAsPaidAction(orderId: string): Promise<MarkAsPaidResult> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()
        const now = new Date().toISOString()
        const normalizedOrderId = String(orderId || '').trim()

        if (!normalizedOrderId) {
            return { success: false, error: 'Order is required.' }
        }

        const existingOrderResult = await supabase
            .from('orders')
            .select('id,payment_status')
            .eq('id', normalizedOrderId)
            .eq('distributor_id', distributorId)
            .maybeSingle()

        if (existingOrderResult.error) {
            return { success: false, error: existingOrderResult.error.message || 'Failed to load order.' }
        }

        if (!existingOrderResult.data) {
            return { success: false, error: 'Order not found or access denied.' }
        }

        const alreadyPaid = normalizePaymentStatus(existingOrderResult.data.payment_status) === 'paid'

        let orderUpdateResult = await supabase
            .from('orders')
            .update({ payment_status: 'paid', paid_at: now } as any)
            .eq('id', normalizedOrderId)
            .eq('distributor_id', distributorId)

        if (orderUpdateResult.error && orderUpdateResult.error.code === '42703') {
            orderUpdateResult = await supabase
                .from('orders')
                .update({ payment_status: 'paid' } as any)
                .eq('id', normalizedOrderId)
                .eq('distributor_id', distributorId)
        }

        if (orderUpdateResult.error) {
            return { success: false, error: orderUpdateResult.error.message || 'Failed to mark order as paid.' }
        }

        const invoiceResult = await supabase
            .from('invoices')
            .select('id,payment_status,paid_at')
            .eq('order_id', normalizedOrderId)
            .eq('distributor_id', distributorId)
            .maybeSingle()

        if (!invoiceResult.error && invoiceResult.data?.id) {
            const invoiceUpdatePayload: Record<string, unknown> = {
                payment_status: 'paid',
                paid_at: invoiceResult.data.paid_at || now,
            }

            let invoiceUpdateResult = await supabase
                .from('invoices')
                .update(invoiceUpdatePayload as any)
                .eq('id', invoiceResult.data.id)
                .eq('distributor_id', distributorId)

            if (invoiceUpdateResult.error && invoiceUpdateResult.error.code === '42703') {
                invoiceUpdateResult = await supabase
                    .from('invoices')
                    .update({ payment_status: 'paid' } as any)
                    .eq('id', invoiceResult.data.id)
                    .eq('distributor_id', distributorId)
            }

            if (invoiceUpdateResult.error && process.env.NODE_ENV !== 'production') {
                console.error('markOrderAsPaidAction: failed to sync invoice payment status', invoiceUpdateResult.error)
            }
        }

        revalidatePath('/distributor/orders')
        revalidatePath(`/distributor/orders/${normalizedOrderId}`)
        revalidatePath('/distributor/invoices')
        if (invoiceResult.data?.id) {
            revalidatePath(`/distributor/invoices/${invoiceResult.data.id}`)
        }

        return { success: true, alreadyPaid }
    } catch (error: any) {
        return { success: false, error: error?.message || 'Failed to mark order as paid.' }
    }
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
    if (allow_case && units_per_case < 1) return { error: 'Units per case must be at least 1' }
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
