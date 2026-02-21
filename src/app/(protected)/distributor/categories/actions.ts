'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'

// --- Categories ---

export async function createCategory(formData: FormData) {
    try {
        const { distributorId } = await getDistributorContext()
        const name = String(formData.get('name') || '').trim()
        if (!name) return { ok: false, error: 'Category name required' }

        const supabase = await createClient()
        const { error } = await supabase.from('categories').insert({ distributor_id: distributorId, name })

        if (error) {
            if (error.code === '23505') return { ok: false, error: 'Category already exists' }
            throw error
        }

        revalidatePath('/distributor/categories')
        return { ok: true }
    } catch (e: any) {
        console.error("createCategory error:", e)
        return { ok: false, error: e.message }
    }
}

export async function updateCategory(categoryId: string, formData: FormData) {
    try {
        const { distributorId } = await getDistributorContext()
        const name = String(formData.get('name') || '').trim()

        if (!name) return { ok: false, error: 'Category name required' }

        const supabase = await createClient()
        const { error } = await supabase
            .from('categories')
            .update({ name })
            .eq('id', categoryId)
            .eq('distributor_id', distributorId)

        if (error) {
            if (error.code === '23505') return { ok: false, error: 'Category already exists' }
            throw error
        }
        revalidatePath('/distributor/categories')
        return { ok: true }
    } catch (e: any) {
        console.error("updateCategory error:", e)
        return { ok: false, error: e.message }
    }
}

export async function deleteCategory(categoryId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        // Soft delete products
        const { error: prodError } = await supabase
            .from('products')
            .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_reason: 'category_archived' })
            .eq('category_id', categoryId)
            .eq('distributor_id', distributorId)

        if (prodError) {
            console.error("archive category products error:", prodError)
            return { ok: false, error: prodError.message }
        }

        // Soft delete old subcategories (for backward compatibility)
        await supabase
            .from('subcategories')
            .update({ is_active: false, deleted_at: new Date().toISOString() })
            .eq('category_id', categoryId)
            .eq('distributor_id', distributorId)

        // Soft delete new category_nodes
        const { error: nodeError } = await supabase
            .from('category_nodes')
            .update({ is_active: false, deleted_at: new Date().toISOString() })
            .eq('category_id', categoryId)
            .eq('distributor_id', distributorId)

        if (nodeError) {
            console.error("archive category nodes error:", nodeError)
            return { ok: false, error: nodeError.message }
        }

        // Soft delete category
        const { error: catError } = await supabase
            .from('categories')
            .update({ is_active: false, deleted_at: new Date().toISOString() })
            .eq('id', categoryId)
            .eq('distributor_id', distributorId)

        if (catError) {
            console.error("archive category error:", catError)
            return { ok: false, error: catError.message }
        }

        revalidatePath('/distributor/categories')
        revalidatePath('/distributor/inventory')
        return { ok: true }
    } catch (e: any) {
        console.error("deleteCategory error:", e)
        return { ok: false, error: e.message || 'Failed to delete category' }
    }
}

// --- Category Nodes (Nested Subcategories) ---

export async function createCategoryNode(formData: FormData) {
    try {
        const { distributorId } = await getDistributorContext()
        const name = String(formData.get('name') || '').trim()
        const categoryId = String(formData.get('category_id') || '').trim()
        const parentId = formData.get('parent_id') ? String(formData.get('parent_id')) : null

        if (!name) return { ok: false, error: 'Node name required' }
        if (!categoryId) return { ok: false, error: 'Category ID required' }

        const supabase = await createClient()
        const { error } = await supabase.from('category_nodes').insert({
            distributor_id: distributorId,
            category_id: categoryId,
            parent_id: parentId,
            name
        })

        if (error) {
            throw error
        }
        revalidatePath('/distributor/categories')
        return { ok: true }
    } catch (e: any) {
        console.error("createCategoryNode error:", e)
        return { ok: false, error: e.message }
    }
}

export async function updateCategoryNode(nodeId: string, formData: FormData) {
    try {
        const { distributorId } = await getDistributorContext()
        const name = String(formData.get('name') || '').trim()

        if (!name) return { ok: false, error: 'Node name required' }

        const supabase = await createClient()
        const { error } = await supabase
            .from('category_nodes')
            .update({ name })
            .eq('id', nodeId)
            .eq('distributor_id', distributorId)

        if (error) {
            throw error
        }
        revalidatePath('/distributor/categories')
        return { ok: true }
    } catch (e: any) {
        console.error("updateCategoryNode error:", e)
        return { ok: false, error: e.message }
    }
}

export async function deleteCategoryNode(nodeId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        // Use the safe RPC which validates if active products are linked to the node before cascading
        const { data: result, error } = await supabase.rpc('archive_category_node', {
            p_node_id: nodeId
        })

        if (error) {
            console.error("archive category node RPC error:", error)
            return { ok: false, error: error.message }
        }

        if (result && result.error) {
            return { ok: false, error: result.error }
        }

        revalidatePath('/distributor/categories')
        revalidatePath('/distributor/inventory')
        return { ok: true }
    } catch (e: any) {
        console.error("deleteCategoryNode error:", e)
        return { ok: false, error: e.message || 'Failed to delete category node' }
    }
}
