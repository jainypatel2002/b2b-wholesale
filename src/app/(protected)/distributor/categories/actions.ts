
'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

export async function createCategory(formData: FormData) {
    const { distributorId } = await getDistributorContext()
    const name = String(formData.get('name') || '').trim()
    if (!name) throw new Error('Category name required')

    const supabase = await createClient()
    const { error } = await supabase.from('categories').insert({ distributor_id: distributorId, name })
    if (error) throw error

    revalidatePath('/distributor/categories')
}

export async function deleteCategory(categoryId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // Soft delete
    const { error } = await supabase
        .from('categories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', categoryId)
        .eq('distributor_id', distributorId)

    if (error) throw error
    revalidatePath('/distributor/categories')
}

export async function createSubcategory(formData: FormData) {
    const { distributorId } = await getDistributorContext()
    const name = String(formData.get('name') || '').trim()
    const categoryId = String(formData.get('category_id') || '').trim()

    if (!name) throw new Error('Subcategory name required')
    if (!categoryId) throw new Error('Category ID required')

    const supabase = await createClient()
    const { error } = await supabase.from('subcategories').insert({
        distributor_id: distributorId,
        category_id: categoryId,
        name
    })

    if (error) throw error
    revalidatePath('/distributor/categories')
}

export async function deleteSubcategory(subcategoryId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // Soft delete
    const { error } = await supabase
        .from('subcategories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', subcategoryId)
        .eq('distributor_id', distributorId)

    if (error) throw error
    revalidatePath('/distributor/categories')
}
