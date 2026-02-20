'use server'

import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

export async function connectDistributor(formData: FormData) {
    const codeOrUuid = String(formData.get('code') || '').trim()
    if (!codeOrUuid) return { success: false, message: 'Distributor code or UUID is required' }

    const { vendorId, profile } = await getVendorContext({ strict: false })
    const supabase = await createClient()

    // 1. Find Distributor by Code or UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrUuid)

    let query = supabase
        .from('profiles')
        .select('id, role, display_name, email')
        .eq('role', 'distributor')

    if (isUuid) {
        query = query.eq('id', codeOrUuid)
    } else {
        query = query.eq('distributor_code', codeOrUuid)
    }

    const { data: distributor, error: distError } = await query.single()

    if (distError || !distributor) {
        return { success: false, message: 'Invalid distributor code or UUID' }
    }

    if (distributor.id === vendorId) {
        return { success: false, message: 'Cannot link to yourself' }
    }

    // 2. Create Link (Upsert to be safe/idempotent)
    // Check if link exists
    const { data: existingLink } = await supabase
        .from('distributor_vendors')
        .select('id')
        .eq('vendor_id', vendorId)
        .eq('distributor_id', distributor.id)
        .single()

    if (!existingLink) {
        const { error: linkError } = await supabase
            .from('distributor_vendors')
            .insert({ vendor_id: vendorId, distributor_id: distributor.id })

        if (linkError && linkError.code !== '23505') { // 23505 is Unique Violation
            console.error("Link Error", linkError)
            return { success: false, message: 'Failed to link distributor. Please try again.' }
        }
    }

    // 3. ALWAYS Set Active (switch to the newly connected one immediately)
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ active_distributor_id: distributor.id })
        .eq('id', vendorId)

    if (updateError) {
        console.error("Update Active Error", updateError)
        return { success: false, message: 'Connected, but failed to switch active distributor.' }
    }

    revalidatePath('/vendor')
    return { success: true, message: `Connected to ${distributor.display_name || distributor.email}` }
}

export async function switchDistributor(distributorId: string) {
    const { vendorId } = await getVendorContext({ strict: false })
    const supabase = await createClient()

    // Verify link exists
    const { data: link } = await supabase
        .from('distributor_vendors')
        .select('id')
        .eq('vendor_id', vendorId)
        .eq('distributor_id', distributorId)
        .single()

    if (!link) {
        return { success: false, code: 'NOT_LINKED', message: 'You are not linked to this distributor' }
    }

    // Update active
    const { error } = await supabase
        .from('profiles')
        .update({ active_distributor_id: distributorId })
        .eq('id', vendorId)

    if (error) {
        console.error('Failed to switch distributor', error)
        return { success: false, code: 'UPDATE_FAILED', message: 'Failed to update active distributor' }
    }

    revalidatePath('/vendor')
    revalidatePath('/vendor/catalog')

    return { success: true }
}
