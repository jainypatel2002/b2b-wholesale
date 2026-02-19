
'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getVendorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

export type ArchiveResult = {
    success?: boolean
    error?: string
}

/**
 * Archive a Product (Distributor Only)
 */
export async function archiveProduct(productId: string): Promise<ArchiveResult> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        // 1. Ownership & Existence Check
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('id')
            .eq('id', productId)
            .eq('distributor_id', distributorId)
            .single()

        if (fetchError || !product) {
            return { error: 'Product not found or unauthorized' }
        }

        // 2. Soft Delete
        const { error } = await supabase
            .from('products')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', productId)
            .eq('distributor_id', distributorId) // Scoped update

        if (error) return { error: `Database error: ${error.message}` }

        revalidatePath('/distributor/inventory')
        revalidatePath('/vendor/catalog')
        return { success: true }
    } catch (err: any) {
        return { error: err.message || 'Unknown error' }
    }
}

/**
 * Archive an Order
 */
export async function archiveOrder(orderId: string, role: 'distributor' | 'vendor'): Promise<ArchiveResult> {
    try {
        const supabase = await createClient()
        let userId: string | undefined

        // 1. Identify User
        if (role === 'distributor') {
            const ctx = await getDistributorContext()
            userId = ctx.distributorId
        } else {
            const ctx = await getVendorContext()
            userId = ctx.vendorId
        }

        // 2. Fetch Order with Invoice status
        // Ensure we select necessary fields for eligibility check
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select(`
                id,
                status,
                distributor_id,
                vendor_id,
                invoices(payment_status)
            `)
            .eq('id', orderId)
            .single()

        if (fetchError || !order) {
            return { error: 'Order not found' }
        }

        // 3. Ownership Check
        if (role === 'distributor' && order.distributor_id !== userId) {
            return { error: 'Unauthorized: You assume the distributor role but do not own this order.' }
        }
        if (role === 'vendor' && order.vendor_id !== userId) {
            return { error: 'Unauthorized: You assume the vendor role but do not own this order.' }
        }

        // 4. Eligibility Check
        // Fulfilled: status is 'fulfilled' or 'completed'
        // Paid: Invoice exists and payment_status is 'paid'
        const validStatuses = ['fulfilled', 'completed']
        const isFulfilled = validStatuses.includes(order.status)

        // invoices is typically an array join, handle both array and object just in case, but usually array
        const invoices = Array.isArray(order.invoices) ? order.invoices : (order.invoices ? [order.invoices] : [])
        const isPaid = invoices.some((inv: any) => inv.payment_status === 'paid')

        if (!isFulfilled) return { error: `Cannot archive: Order status is '${order.status}', must be fulfilled.` }
        if (!isPaid) return { error: 'Cannot archive: Order is not paid.' }

        // 5. Soft Delete
        const { error } = await supabase
            .from('orders')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', orderId)
            // Extra safety: enforce ownership in update query
            .eq(role === 'distributor' ? 'distributor_id' : 'vendor_id', userId!)

        if (error) return { error: `Database error: ${error.message}` }

        if (role === 'distributor') revalidatePath('/distributor/orders')
        else revalidatePath('/vendor/orders')

        return { success: true }
    } catch (err: any) {
        return { error: err.message || 'Unknown error' }
    }
}

/**
 * Archive an Invoice
 */
export async function archiveInvoice(invoiceId: string, role: 'distributor' | 'vendor'): Promise<ArchiveResult> {
    try {
        const supabase = await createClient()
        let userId: string | undefined

        if (role === 'distributor') {
            const ctx = await getDistributorContext()
            userId = ctx.distributorId
        } else {
            const ctx = await getVendorContext()
            userId = ctx.vendorId
        }

        // 1. Fetch Invoice
        const { data: invoice, error: fetchError } = await supabase
            .from('invoices')
            .select(`
                id,
                distributor_id,
                payment_status,
                orders(vendor_id)
            `)
            .eq('id', invoiceId)
            .single()

        if (fetchError || !invoice) {
            return { error: 'Invoice not found' }
        }

        // 2. Ownership Check
        if (role === 'distributor') {
            if (invoice.distributor_id !== userId) return { error: 'Unauthorized' }
        } else {
            // Vendor check: does the linked order belong to this vendor?
            // invoice.orders might be single object or array depending on relationship
            const linkedOrders = Array.isArray(invoice.orders) ? invoice.orders : (invoice.orders ? [invoice.orders] : [])
            const isOwner = linkedOrders.some((o: any) => o.vendor_id === userId)
            if (!isOwner) return { error: 'Unauthorized: This invoice does not belong to your orders.' }
        }

        // 3. Eligibility Check
        if (invoice.payment_status !== 'paid') {
            return { error: 'Cannot archive: Invoice is not paid.' }
        }

        // 4. Soft Delete
        const { error } = await supabase
            .from('invoices')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', invoiceId)

        if (error) return { error: `Database error: ${error.message}` }

        if (role === 'distributor') revalidatePath('/distributor/invoices')
        else revalidatePath('/vendor/invoices')

        return { success: true }
    } catch (err: any) {
        return { error: err.message || 'Unknown error' }
    }
}
