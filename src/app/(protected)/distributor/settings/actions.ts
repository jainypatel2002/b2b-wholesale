'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function updateDisplayName(formData: FormData) {
    const profile = await requireRole('distributor')
    const newName = String(formData.get('display_name') || '').trim()

    // Basic validation
    if (newName.length > 60) {
        return { success: false, message: 'Display name cannot exceed 60 characters.' }
    }

    const supabase = await createClient()

    const { error } = await supabase
        .from('profiles')
        .update({ display_name: newName || null }) // null if empty, falling back to email elsewhere
        .eq('id', profile.id)

    if (error) {
        console.error('Failed to update display name:', error)
        return { success: false, message: 'Failed to update display name.' }
    }

    revalidatePath('/distributor')
    revalidatePath('/distributor/settings')

    return { success: true, message: 'Display name updated successfully.' }
}
