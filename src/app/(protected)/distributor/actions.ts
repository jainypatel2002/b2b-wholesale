'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function ensureAndGetCode() {
    const supabase = await createClient()
    const { data: code, error } = await supabase.rpc('ensure_distributor_code')

    if (error) {
        console.error('Failed to ensure code:', error)
        throw new Error('Failed to generate code')
    }

    revalidatePath('/distributor', 'layout')
    return code as string
}
