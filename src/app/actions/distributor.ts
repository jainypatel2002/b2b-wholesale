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

    // 1. Fetch Order & Check existence
    const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('id, vendor_id, order_items(product_id, qty, unit_price, unit_cost)')
        .eq('id', orderId)
        .eq('distributor_id', distributorId)
        .single()

    if (orderErr || !order) return { error: 'Order not found' }

    // 2. Check if invoice already exists
    const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle()

    if (existing) {
        return { success: true, invoiceId: existing.id, message: 'Invoice already exists' }
    }

    // 3. Calculate Totals
    const items = order.order_items ?? []
    if (!items.length) return { error: 'Order has no items' }

    const subtotal = items.reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
    const invoice_number = `INV-${order.id.slice(0, 8).toUpperCase()}`

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

    if (invErr) return { error: invErr.message }

    // 5. Create Invoice Items
    const invoiceItems = items.map((it: any) => ({
        invoice_id: invoice.id,
        product_id: it.product_id,
        qty: it.qty,
        unit_price: it.unit_price,
        unit_cost: it.unit_cost
    }))

    const { error: itemsErr } = await supabase.from('invoice_items').insert(invoiceItems)

    if (itemsErr) {
        // Cleanup invoice if items fail (optional, but good practice)
        await supabase.from('invoices').delete().eq('id', invoice.id)
        return { error: 'Failed to create invoice items: ' + itemsErr.message }
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
    const stock_qty = Number(formData.get('stock_qty') || 0)

    if (!id) return { error: 'Product ID required' }
    if (!name) return { error: 'Product name required' }

    const { error } = await supabase
        .from('products')
        .update({
            name,
            sku,
            category_id,
            cost_price,
            sell_price,
            stock_qty
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
