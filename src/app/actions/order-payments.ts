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

function parseMoneyInput(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100) / 100
}

function normalizeText(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? '').trim()
  return value ? value : null
}

export async function recordOrderPaymentAction(
  _prevState: OrderPaymentActionState,
  formData: FormData
): Promise<OrderPaymentActionState> {
  try {
    await getDistributorContext()
    const supabase = await createClient()

    const orderId = String(formData.get('order_id') || '').trim()
    const amount = parseMoneyInput(formData.get('amount'))
    const method = normalizeText(formData.get('method'))
    const note = normalizeText(formData.get('note'))

    if (!orderId) return { ...initialOrderPaymentActionState, error: 'Order is required.' }
    if (amount == null) return { ...initialOrderPaymentActionState, error: 'Enter an amount greater than 0.' }

    const { data, error } = await supabase.rpc('add_order_payment', {
      p_order_id: orderId,
      p_amount: amount,
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
