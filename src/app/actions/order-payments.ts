'use server'

import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/data'
import { toNumber } from '@/lib/number'
import { createClient } from '@/lib/supabase/server'

export type OrderPaymentActionState = {
  success: boolean
  error: string | null
  message: string | null
  totalAmount: number | null
  amountPaid: number | null
  amountDue: number | null
}

export const initialOrderPaymentActionState: OrderPaymentActionState = {
  success: false,
  error: null,
  message: null,
  totalAmount: null,
  amountPaid: null,
  amountDue: null,
}

const MAX_PAYMENT_AMOUNT = 1_000_000
const PAYMENT_AMOUNT_REGEX = /^(?:\d+)(?:\.\d{1,2})?$/

function parseMoneyInput(raw: FormDataEntryValue | null): { value: number | null; error: string | null } {
  const value = String(raw ?? '').trim()
  if (!value) return { value: null, error: 'Amount is required.' }
  if (!PAYMENT_AMOUNT_REGEX.test(value)) {
    return { value: null, error: 'Enter a valid amount with up to 2 decimals.' }
  }

  const amount = Number(value)
  if (!Number.isFinite(amount)) return { value: null, error: 'Enter a valid amount.' }
  if (amount <= 0) return { value: null, error: 'Amount must be greater than 0.' }
  if (amount > MAX_PAYMENT_AMOUNT) {
    return { value: null, error: `Amount must be $${MAX_PAYMENT_AMOUNT.toLocaleString('en-US')} or less.` }
  }

  return { value: Math.round(amount * 100) / 100, error: null }
}

function normalizeText(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? '').trim()
  return value ? value : null
}

function normalizeMethod(raw: FormDataEntryValue | null): string {
  const value = String(raw ?? '').trim().toLowerCase()
  return value || 'unspecified'
}

export async function recordOrderPaymentAction(
  _prevState: OrderPaymentActionState,
  formData: FormData
): Promise<OrderPaymentActionState> {
  try {
    await getDistributorContext()
    const supabase = await createClient()

    const orderId = String(formData.get('order_id') || '').trim()
    const amountParse = parseMoneyInput(formData.get('amount'))
    const method = normalizeMethod(formData.get('method'))
    const note = normalizeText(formData.get('note'))

    if (!orderId) return { ...initialOrderPaymentActionState, error: 'Order is required.' }
    if (amountParse.error || amountParse.value == null) {
      return { ...initialOrderPaymentActionState, error: amountParse.error || 'Enter a valid amount.' }
    }
    if (note && note.length > 500) {
      return { ...initialOrderPaymentActionState, error: 'Note cannot exceed 500 characters.' }
    }

    const { data, error } = await supabase.rpc('record_order_payment', {
      p_order_id: orderId,
      p_amount: amountParse.value,
      p_method: method,
      p_note: note,
    })

    if (error) {
      return {
        ...initialOrderPaymentActionState,
        error: error.message || 'Failed to record payment.',
      }
    }

    const payload = (data ?? {}) as any

    revalidatePath('/distributor/orders')
    revalidatePath(`/distributor/orders/${orderId}`)
    revalidatePath('/distributor/credits')
    revalidatePath('/distributor/invoices')
    revalidatePath('/vendor/orders')
    revalidatePath(`/vendor/orders/${orderId}`)
    revalidatePath('/vendor/credits')
    revalidatePath('/vendor')

    return {
      success: true,
      error: null,
      message: 'Payment recorded.',
      totalAmount: toNumber(payload?.total_amount ?? 0, 0),
      amountPaid: toNumber(payload?.amount_paid ?? 0, 0),
      amountDue: toNumber(payload?.amount_due ?? 0, 0),
    }
  } catch (error: any) {
    return {
      ...initialOrderPaymentActionState,
      error: error?.message || 'Failed to record payment.',
    }
  }
}
