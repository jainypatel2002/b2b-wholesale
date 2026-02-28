'use server'

import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { VendorCreditActionState, initialVendorCreditActionState } from '@/lib/credits/types'

function parseMoneyInput(raw: FormDataEntryValue | null, allowZero = false): number | null {
    if (raw == null) return null
    const amount = Number(raw)
    if (!Number.isFinite(amount)) return null
    if (allowZero ? amount < 0 : amount <= 0) return null
    return Math.round(amount * 100) / 100
}

function normalizeText(raw: FormDataEntryValue | null): string | null {
    const text = String(raw ?? '').trim()
    return text ? text : null
}

export async function addVendorCreditAction(
    _prevState: VendorCreditActionState,
    formData: FormData
): Promise<VendorCreditActionState> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const vendorId = String(formData.get('vendor_id') || '').trim()
        const amount = parseMoneyInput(formData.get('amount'), false)
        const note = normalizeText(formData.get('note'))

        if (!vendorId) return { ...initialVendorCreditActionState, error: 'Vendor is required.' }
        if (amount == null) return { ...initialVendorCreditActionState, error: 'Enter an amount greater than 0.' }

        const { data, error } = await supabase.rpc('add_vendor_credit', {
            p_distributor_id: distributorId,
            p_vendor_id: vendorId,
            p_amount: amount,
            p_note: note,
        })

        if (error) {
            return { ...initialVendorCreditActionState, error: error.message || 'Failed to add vendor credit.' }
        }

        const payload = (data ?? {}) as any

        revalidatePath('/distributor/credits')
        revalidatePath('/vendor/credits')
        revalidatePath('/vendor')

        return {
            success: true,
            error: null,
            message: 'Credit added.',
            newBalance: Number(payload?.new_balance ?? 0),
        }
    } catch (error: any) {
        return { ...initialVendorCreditActionState, error: error?.message || 'Failed to add vendor credit.' }
    }
}

export async function deductVendorCreditAction(
    _prevState: VendorCreditActionState,
    formData: FormData
): Promise<VendorCreditActionState> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const vendorId = String(formData.get('vendor_id') || '').trim()
        const amount = parseMoneyInput(formData.get('amount'), false)
        const note = normalizeText(formData.get('note'))

        if (!vendorId) return { ...initialVendorCreditActionState, error: 'Vendor is required.' }
        if (amount == null) return { ...initialVendorCreditActionState, error: 'Enter an amount greater than 0.' }

        const { data, error } = await supabase.rpc('deduct_vendor_credit', {
            p_distributor_id: distributorId,
            p_vendor_id: vendorId,
            p_amount: amount,
            p_note: note,
        })

        if (error) {
            return { ...initialVendorCreditActionState, error: error.message || 'Failed to deduct vendor credit.' }
        }

        const payload = (data ?? {}) as any

        revalidatePath('/distributor/credits')
        revalidatePath('/vendor/credits')
        revalidatePath('/vendor')

        return {
            success: true,
            error: null,
            message: 'Credit deducted.',
            newBalance: Number(payload?.new_balance ?? 0),
        }
    } catch (error: any) {
        return { ...initialVendorCreditActionState, error: error?.message || 'Failed to deduct vendor credit.' }
    }
}

export async function applyVendorCreditToOrderAction(
    _prevState: VendorCreditActionState,
    formData: FormData
): Promise<VendorCreditActionState> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const vendorId = String(formData.get('vendor_id') || '').trim()
        const orderId = String(formData.get('order_id') || '').trim()
        const amount = parseMoneyInput(formData.get('amount'), true)
        const note = normalizeText(formData.get('note'))

        if (!vendorId) return { ...initialVendorCreditActionState, error: 'Vendor is required.' }
        if (!orderId) return { ...initialVendorCreditActionState, error: 'Order is required.' }
        if (amount == null) return { ...initialVendorCreditActionState, error: 'Enter a valid credit amount.' }

        const { data, error } = await supabase.rpc('apply_vendor_credit_to_order', {
            p_distributor_id: distributorId,
            p_vendor_id: vendorId,
            p_order_id: orderId,
            p_amount: amount,
            p_note: note,
        })

        if (error) {
            return { ...initialVendorCreditActionState, error: error.message || 'Failed to apply credit.' }
        }

        const payload = (data ?? {}) as any
        const invoiceId = payload?.invoice_id ? String(payload.invoice_id) : null

        revalidatePath('/distributor/credits')
        revalidatePath('/vendor/credits')
        revalidatePath('/vendor')
        revalidatePath('/distributor/orders')
        revalidatePath(`/distributor/orders/${orderId}`)
        revalidatePath('/vendor/orders')
        revalidatePath(`/vendor/orders/${orderId}`)
        revalidatePath('/distributor/invoices')
        revalidatePath('/vendor/invoices')

        if (invoiceId) {
            revalidatePath(`/distributor/invoices/${invoiceId}`)
            revalidatePath(`/vendor/invoices/${invoiceId}`)
        }

        return {
            success: true,
            error: null,
            message: 'Credit applied.',
            newBalance: Number(payload?.new_balance ?? 0),
            appliedAmount: Number(payload?.applied_amount ?? 0),
            orderTotal: Number(payload?.order_total ?? 0),
            amountDue: Number(payload?.amount_due ?? 0),
            invoiceId,
        }
    } catch (error: any) {
        return { ...initialVendorCreditActionState, error: error?.message || 'Failed to apply credit.' }
    }
}
