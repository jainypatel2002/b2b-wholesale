'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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

export async function createInvoiceAction(orderId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    console.log('[createInvoiceAction] Starting for order:', orderId, 'Distributor:', distributorId)

    // 1. Fetch Order & Check existence
    const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select(`
            id, 
            vendor_id, 
            order_items(
                product_id, qty, unit_price, unit_cost,
                order_unit, cases_qty, pieces_qty, units_per_case_snapshot, total_pieces
            )
        `)
        .eq('id', orderId)
        .eq('distributor_id', distributorId)
        .single()

    if (orderErr || !order) {
        console.error('[createInvoiceAction] Order not found or error:', orderErr)
        return { error: 'Order not found' }
    }

    console.log('[createInvoiceAction] Order found:', order.id, 'Items count:', order.order_items?.length)

    // 2. Check if invoice already exists
    const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle()

    if (existing) {
        console.log('[createInvoiceAction] Invoice already exists:', existing.id)
        return { success: true, invoiceId: existing.id, message: 'Invoice already exists' }
    }

    // 3. Calculate Totals safely
    const items = order.order_items ?? []
    if (!items.length) {
        console.error('[createInvoiceAction] Order has no items')
        return { error: 'Order has no items' }
    }

    // Calculate subtotal with backward compatibility
    const subtotal = items.reduce((sum: number, it: any) => {
        // Fallback logic for various schemas
        const qty = it.qty ?? it.total_pieces ??
            ((it.cases_qty || 0) * (it.units_per_case_snapshot || 1) + (it.pieces_qty || 0));

        const price = Number(it.unit_price || 0);
        return sum + (price * Number(qty));
    }, 0)

    const invoice_number = `INV-${order.id.slice(0, 8).toUpperCase()}`
    console.log('[createInvoiceAction] Calculated Subtotal:', subtotal)

    // 4. Create Invoice
    const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
            distributor_id: distributorId,
            vendor_id: order.vendor_id,
            order_id: order.id,
            invoice_number,
            subtotal,
            tax: 0,
            total: subtotal,
            payment_method: 'cash',
            payment_status: 'unpaid'
        })
        .select('id')
        .single()

    if (invErr) {
        console.error('[createInvoiceAction] Invoice Insert Error:', invErr)
        return { error: `Failed to create invoice: ${invErr.message}` }
    }

    // 5. Create Invoice Items
    try {
        const invoiceItems = items.map((it: any) => ({
            invoice_id: invoice.id,
            product_id: it.product_id,
            qty: it.qty ?? it.total_pieces ?? 0, // Ensure strictly not null
            unit_price: it.unit_price,
            unit_cost: it.unit_cost,
            // New fields with fallbacks
            order_unit: it.order_unit || 'piece',
            cases_qty: it.cases_qty,
            pieces_qty: it.pieces_qty,
            units_per_case_snapshot: it.units_per_case_snapshot,
            total_pieces: it.total_pieces ?? it.qty
        }))

        const { error: itemsErr } = await supabase.from('invoice_items').insert(invoiceItems)

        if (itemsErr) {
            console.error('[createInvoiceAction] Invoice Items Insert Error:', itemsErr)
            // Rollback
            await supabase.from('invoices').delete().eq('id', invoice.id)
            return { error: `Failed to create invoice items: ${itemsErr.message}` }
        }
    } catch (e: any) {
        console.error('[createInvoiceAction] Exception during item prep:', e)
        await supabase.from('invoices').delete().eq('id', invoice.id)
        return { error: `Error preparing invoice items: ${e.message}` }
    }

    revalidatePath('/distributor/orders')
    revalidatePath(`/distributor/orders/${orderId}`)
    return { success: true, invoiceId: invoice.id }
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

    const id = String(formData.get('id'))
    const name = String(formData.get('name') || '').trim()
    const sku = String(formData.get('sku') || '').trim() || null
    const category_id = String(formData.get('category_id') || '').trim() || null

    const cost_price = Number(formData.get('cost_price') || 0)
    const sell_price = Number(formData.get('sell_price') || 0)

    // New fields
    const stock_pieces = Number(formData.get('stock_qty') || 0) // Map stock entry to pieces
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
