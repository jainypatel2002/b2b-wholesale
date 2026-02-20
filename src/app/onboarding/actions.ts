'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'

export async function resolveDistributor(codeOrUuid: string) {
    const supabase = await createClient()

    // Check if it's a UUID format
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrUuid)

    let query = supabase.from('profiles').select('id, display_name, email, distributor_code').eq('role', 'distributor')

    if (isUuid) {
        query = query.eq('id', codeOrUuid)
    } else {
        query = query.eq('distributor_code', codeOrUuid)
    }

    const { data, error } = await query.single()

    if (error || !data) {
        return { success: false, message: 'Distributor not found. Please check the code or UUID.' }
    }

    return {
        success: true,
        distributor: {
            id: data.id,
            name: data.display_name || data.email,
            code: data.distributor_code
        }
    }
}
