'use server'

import { revalidatePath } from 'next/cache'
import { getDistributorContext } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'

const MAX_MANUAL_AMOUNT_DUE = 100_000_000

export type SaveManualAmountDueResult = {
    success: boolean
    error?: string
    manualAmountDue?: number
    updatedAt?: string
}

export async function saveManualAmountDueAction(params: {
    vendorId: string
    manualAmountDue: number
}): Promise<SaveManualAmountDueResult> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const vendorId = String(params.vendorId || '').trim()
        const rawAmount = Number(params.manualAmountDue)

        if (!vendorId) {
            return { success: false, error: 'Vendor is required.' }
        }
        if (!Number.isFinite(rawAmount)) {
            return { success: false, error: 'Enter a valid amount.' }
        }
        if (rawAmount < 0) {
            return { success: false, error: 'Amount must be 0 or greater.' }
        }
        if (rawAmount > MAX_MANUAL_AMOUNT_DUE) {
            return { success: false, error: `Amount must be $${MAX_MANUAL_AMOUNT_DUE.toLocaleString('en-US')} or less.` }
        }

        const manualAmountDue = Math.round(rawAmount * 100) / 100
        const now = new Date().toISOString()

        const linkResult = await supabase
            .from('distributor_vendors')
            .select('vendor_id')
            .eq('distributor_id', distributorId)
            .eq('vendor_id', vendorId)
            .maybeSingle()

        if (linkResult.error) {
            return {
                success: false,
                error: linkResult.error.message || 'Failed to validate vendor link.',
            }
        }

        if (!linkResult.data) {
            return { success: false, error: 'Vendor is not linked to your distributor account.' }
        }

        let updateResult = await supabase
            .from('distributor_vendors')
            .update({
                manual_amount_due: manualAmountDue,
                manual_amount_due_updated_at: now,
            } as any)
            .eq('distributor_id', distributorId)
            .eq('vendor_id', vendorId)
            .select('manual_amount_due,manual_amount_due_updated_at')
            .maybeSingle()

        if (updateResult.error && updateResult.error.code === '42703') {
            return {
                success: false,
                error: 'Manual amount due is not available yet. Apply the latest migration and reload schema cache.',
            }
        }

        if (updateResult.error) {
            return {
                success: false,
                error: updateResult.error.message || 'Failed to save manual amount due.',
            }
        }

        revalidatePath('/distributor')
        revalidatePath('/distributor/credits')

        return {
            success: true,
            manualAmountDue: Number(updateResult.data?.manual_amount_due ?? manualAmountDue),
            updatedAt: String(updateResult.data?.manual_amount_due_updated_at ?? now),
        }
    } catch (error: any) {
        return {
            success: false,
            error: error?.message || 'Failed to save manual amount due.',
        }
    }
}
