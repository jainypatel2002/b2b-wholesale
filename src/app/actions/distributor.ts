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

    const newTotal = (allItems ?? []).reduce((sum: number, it: any) => {
        if (it.removed) return sum
        const effectiveQty = it.edited_qty ?? it.qty ?? 0
        const effectivePrice = it.edited_unit_price ?? it.unit_price ?? 0
        return sum + Number(effectivePrice) * Number(effectiveQty)
    }, 0)

    revalidatePath(`/distributor/orders/${orderId}`)
    revalidatePath('/distributor/orders')
    return { success: true, updated_count: updatedCount, new_total: newTotal }
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
                product_id, qty, unit_price, unit_cost, product_name,
                order_unit, cases_qty, pieces_qty, units_per_case_snapshot, total_pieces,
                edited_name, edited_unit_price, edited_qty, removed
            ),
            order_adjustments(id, name, amount),
            order_taxes(id, name, type, rate_percent)
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

    // 3. Filter out removed items and calculate totals with edit support
    const allItems = order.order_items ?? []
    const items = allItems.filter((it: any) => !it.removed)
    const adjustments = order.order_adjustments ?? []
    const taxes = order.order_taxes ?? []

    if (!items.length && !adjustments.length) {
        console.error('[createInvoiceAction] Order has no active items or adjustments')
        return { error: 'Cannot generate invoice with zero items.' }
    }

    // Calculate item subtotal using effective (edited) values
    const itemSubtotal = items.reduce((sum: number, it: any) => {
        const effectiveQty = it.edited_qty ?? it.qty ?? it.total_pieces ??
            ((it.cases_qty || 0) * (it.units_per_case_snapshot || 1) + (it.pieces_qty || 0));
        const effectivePrice = Number(it.edited_unit_price ?? it.unit_price ?? 0);
        return sum + (effectivePrice * Number(effectiveQty));
    }, 0)

    const adjustmentTotal = adjustments.reduce((sum: number, adj: any) => sum + Number(adj.amount), 0)
    const subtotal = itemSubtotal + adjustmentTotal

    // Calculate Taxes
    let taxTotal = 0
    const calculatedTaxes = taxes.map((tax: any) => {
        let amount = 0
        if (tax.type === 'percent') {
            amount = subtotal * (Number(tax.rate_percent) / 100)
        } else if (tax.type === 'fixed') {
            amount = Number(tax.rate_percent) || 0
        }
        taxTotal += amount
        // Limit decimal places to handle floating point issues securely
        return { ...tax, amount: Number(amount.toFixed(2)) }
    })

    // JS math rounding for exact cents
    taxTotal = Number(taxTotal.toFixed(2))
    const total = Number((subtotal + taxTotal).toFixed(2))

    // For safety, generate a unique random ID fragment
    const invoice_number = `INV-${order.id.slice(0, 8).toUpperCase()}`

    console.log('[createInvoiceAction] Calculated Subtotal:', subtotal, 'Tax:', taxTotal, 'Total:', total)

    // 4. Create Invoice
    const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
            distributor_id: distributorId,
            vendor_id: order.vendor_id,
            order_id: order.id,
            invoice_number,
            subtotal,
            tax_total: taxTotal,
            // the old column is tax, so let's save to both for backward compat for now
            tax: taxTotal,
            total,
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
        const invoiceItems = items.map((it: any) => {
            const effectiveQty = it.edited_qty ?? it.qty ?? it.total_pieces ?? 0
            const effectivePrice = it.edited_unit_price ?? it.unit_price
            const effectiveName = it.edited_name ?? it.product_name
            const extAmount = Number((Number(effectivePrice) * Number(effectiveQty)).toFixed(2))

            return {
                invoice_id: invoice.id,
                product_id: it.product_id,
                product_name: effectiveName,
                qty: effectiveQty,
                unit_price: effectivePrice,
                unit_cost: it.unit_cost,
                order_unit: it.order_unit || 'piece',
                cases_qty: it.cases_qty,
                pieces_qty: it.pieces_qty,
                units_per_case_snapshot: it.units_per_case_snapshot,
                total_pieces: it.total_pieces ?? it.qty,
                effective_units: effectiveQty,
                ext_amount: extAmount,
                is_manual: false
            }
        })

        // Also map order_adjustments into invoice items (so they render safely line-by-line)
        const manualItems = adjustments.map((adj: any) => {
            return {
                invoice_id: invoice.id,
                product_name: adj.name,
                qty: 1,
                unit_price: adj.amount,
                unit_cost: 0,
                order_unit: 'piece',
                effective_units: 1,
                ext_amount: adj.amount,
                is_manual: true
            }
        })

        const allInvoiceItems = [...invoiceItems, ...manualItems]
        const { error: itemsErr } = await supabase.from('invoice_items').insert(allInvoiceItems)

        if (itemsErr) throw new Error(`Items Insert: ${itemsErr.message}`)

        if (calculatedTaxes.length > 0) {
            const taxRows = calculatedTaxes.map((tax: any) => ({
                invoice_id: invoice.id,
                name: tax.name,
                type: tax.type,
                rate_percent: tax.rate_percent,
                amount: tax.amount
            }))
            const { error: taxErr } = await supabase.from('invoice_taxes').insert(taxRows)
            if (taxErr) throw new Error(`Taxes Insert: ${taxErr.message}`)
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
