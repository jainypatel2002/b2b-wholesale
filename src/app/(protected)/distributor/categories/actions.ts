'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

// --- Categories ---

export async function createCategory(formData: FormData) {
    const { distributorId } = await getDistributorContext()
    const name = String(formData.get('name') || '').trim()
    if (!name) throw new Error('Category name required')

    const supabase = await createClient()
    const { error } = await supabase.from('categories').insert({ distributor_id: distributorId, name })

    if (error) {
        if (error.code === '23505') throw new Error('Category already exists')
        throw error
    }

    revalidatePath('/distributor/categories')
}

export async function updateCategory(categoryId: string, formData: FormData) {
    const { distributorId } = await getDistributorContext()
    const name = String(formData.get('name') || '').trim()

    if (!name) throw new Error('Category name required')

    const supabase = await createClient()
    const { error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', categoryId)
        .eq('distributor_id', distributorId)

    if (error) {
        if (error.code === '23505') throw new Error('Category already exists')
        throw error
    }
    revalidatePath('/distributor/categories')
}

export async function deleteCategory(categoryId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // RPC: Archive Category (Safely archives category + subcategories + products)
    const { data: result, error } = await supabase.rpc('archive_category', {
        p_category_id: categoryId
    })

    if (error) throw error

    if (result && result.error) {
        throw new Error(result.error)
    }

    revalidatePath('/distributor/categories')
    revalidatePath('/distributor/inventory')
}

// --- Subcategories ---

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

    if (error) {
        if (error.code === '23505') throw new Error('Subcategory already exists in this category')
        throw error
    }
    revalidatePath('/distributor/categories')
}

export async function updateSubcategory(subcategoryId: string, formData: FormData) {
    const { distributorId } = await getDistributorContext()
    const name = String(formData.get('name') || '').trim()

    if (!name) throw new Error('Subcategory name required')

    const supabase = await createClient()
    const { error } = await supabase
        .from('subcategories')
        .update({ name })
        .eq('id', subcategoryId)
        .eq('distributor_id', distributorId)

    if (error) {
        if (error.code === '23505') throw new Error('Subcategory already exists in this category')
        throw error
    }
    revalidatePath('/distributor/categories')
}

export async function deleteSubcategory(subcategoryId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // RPC: Archive Subcategory (Safely archives subcategory + products)
    const { data: result, error } = await supabase.rpc('archive_subcategory', {
        p_subcategory_id: subcategoryId
    })

    if (error) throw error

    if (result && result.error) {
        throw new Error(result.error)
    }

    revalidatePath('/distributor/categories')
    revalidatePath('/distributor/inventory')
}
