'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { isCategoryNodeInCategory } from '@/lib/inventory/category-node-utils'
import { normalizeBarcode } from '@/lib/utils/barcode'
import { safeUnitsPerCase, toCaseFromUnit, toUnitFromCase } from '@/lib/pricing/display'

export type InventoryActionState = {
    success?: boolean
    error?: string | null
    details?: any
}

export type AddBarcodeToProductResult = {
    success: boolean
    barcode?: string
    alreadyAdded?: boolean
    error?: string
}

type InventorySupabaseClient = Awaited<ReturnType<typeof createClient>>

type SubmittedBarcodeEntry = {
    barcode: string
    isPrimary: boolean
}

function resolveUnitCasePair(input: {
    mode: 'unit' | 'case'
    unitPrice: number | null | undefined
    casePrice: number | null | undefined
    unitsPerCase: unknown
}): { unitPrice: number | null; casePrice: number | null } {
    const unitInput = input.unitPrice ?? null
    const caseInput = input.casePrice ?? null
    const validUnitsPerCase = safeUnitsPerCase(input.unitsPerCase)

    if (input.mode === 'case') {
        const casePrice = caseInput ?? toCaseFromUnit(unitInput, validUnitsPerCase)
        const unitPrice = casePrice !== null
            ? (toUnitFromCase(casePrice, validUnitsPerCase) ?? unitInput)
            : unitInput
        return { unitPrice, casePrice }
    }

    const unitPrice = unitInput ?? toUnitFromCase(caseInput, validUnitsPerCase)
    const casePrice = unitPrice !== null
        ? (toCaseFromUnit(unitPrice, validUnitsPerCase) ?? caseInput)
        : caseInput

    return { unitPrice, casePrice }
}

function isMissingProductBarcodesTableError(error: any): boolean {
    const code = String(error?.code || '')
    const message = String(error?.message || '').toLowerCase()
    return (
        code === '42P01'
        || code === 'PGRST205'
        || message.includes('product_barcodes')
    )
}

function isBarcodeConstraintError(error: any): boolean {
    const code = String(error?.code || '')
    const message = String(error?.message || '').toLowerCase()
    return code === '23505' && message.includes('barcode')
}

function parseBarcodesFromForm(formData: FormData): {
    entries: SubmittedBarcodeEntry[]
    primaryBarcode: string | null
    error?: string
} {
    const rawEntries: Array<{ value: string; isPrimary: boolean }> = []

    const rawJson = String(formData.get('barcodes_json') || '').trim()
    if (rawJson) {
        try {
            const parsed = JSON.parse(rawJson)
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (typeof item === 'string') {
                        rawEntries.push({ value: item, isPrimary: false })
                    } else if (item && typeof item === 'object') {
                        rawEntries.push({
                            value: String((item as any).barcode ?? (item as any).value ?? ''),
                            isPrimary: (item as any).isPrimary === true
                        })
                    }
                }
            }
        } catch {
            return { entries: [], primaryBarcode: null, error: 'Invalid barcode payload. Please retry.' }
        }
    }

    if (rawEntries.length === 0) {
        const fallbackLegacy = String(formData.get('barcode') || '')
        if (fallbackLegacy.trim()) {
            rawEntries.push({ value: fallbackLegacy, isPrimary: true })
        }
    }

    const entries: SubmittedBarcodeEntry[] = []
    const seen = new Set<string>()

    for (const entry of rawEntries) {
        const rawValue = String(entry.value || '').trim()
        if (!rawValue) continue

        const normalized = normalizeBarcode(rawValue)
        if (!normalized) continue

        if (normalized.length < 6) {
            return {
                entries: [],
                primaryBarcode: null,
                error: `Barcode "${rawValue}" is too short. Minimum length is 6.`
            }
        }

        if (seen.has(normalized)) continue
        seen.add(normalized)
        entries.push({ barcode: normalized, isPrimary: entry.isPrimary })
    }

    if (entries.length === 0) {
        return { entries: [], primaryBarcode: null }
    }

    const primaryBarcode = entries.find((entry) => entry.isPrimary)?.barcode ?? entries[0].barcode
    return {
        entries: entries.map((entry) => ({
            barcode: entry.barcode,
            isPrimary: entry.barcode === primaryBarcode
        })),
        primaryBarcode
    }
}

async function findBarcodeCollision(params: {
    supabase: InventorySupabaseClient
    distributorId: string
    barcodes: string[]
    excludeProductId?: string | null
}): Promise<{ barcode: string; productName: string } | null> {
    const { supabase, distributorId, barcodes, excludeProductId } = params
    if (barcodes.length === 0) return null

    const productNameById = new Map<string, string>()

    let aliasRows: Array<{ barcode: string; product_id: string }> = []
    const aliasResult = await supabase
        .from('product_barcodes')
        .select('barcode,product_id')
        .eq('distributor_id', distributorId)
        .in('barcode', barcodes)

    if (!aliasResult.error) {
        aliasRows = (aliasResult.data ?? [])
            .map((row: any) => ({
                barcode: String(row.barcode || ''),
                product_id: String(row.product_id || '')
            }))
            .filter((row) => row.barcode && row.product_id && row.product_id !== excludeProductId)

        const aliasProductIds = Array.from(new Set(aliasRows.map((row) => row.product_id)))
        if (aliasProductIds.length > 0) {
            const namesResult = await supabase
                .from('products')
                .select('id,name')
                .in('id', aliasProductIds)

            if (!namesResult.error) {
                for (const row of namesResult.data ?? []) {
                    productNameById.set(String((row as any).id || ''), String((row as any).name || 'another product'))
                }
            }
        }
    } else if (!isMissingProductBarcodesTableError(aliasResult.error)) {
        throw new Error(aliasResult.error.message || 'Failed to validate barcode aliases')
    }

    let legacyResult = await supabase
        .from('products')
        .select('id,name,barcode')
        .eq('distributor_id', distributorId)
        .in('barcode', barcodes)
        .is('deleted_at', null)

    if (legacyResult.error && legacyResult.error.code === '42703') {
        legacyResult = await supabase
            .from('products')
            .select('id,name,barcode')
            .eq('distributor_id', distributorId)
            .in('barcode', barcodes)
    }

    if (legacyResult.error) {
        throw new Error(legacyResult.error.message || 'Failed to validate legacy barcode uniqueness')
    }

    for (const row of legacyResult.data ?? []) {
        const id = String((row as any).id || '')
        const barcode = String((row as any).barcode || '')
        if (!id || !barcode || id === excludeProductId) continue
        if (!productNameById.has(id)) {
            productNameById.set(id, String((row as any).name || 'another product'))
        }
        aliasRows.push({ barcode, product_id: id })
    }

    const firstCollision = aliasRows.find((row) => barcodes.includes(row.barcode))
    if (!firstCollision) return null

    return {
        barcode: firstCollision.barcode,
        productName: productNameById.get(firstCollision.product_id) || 'another product'
    }
}

export async function addBarcodeToProduct(params: {
    productId: string
    barcode: string
}): Promise<AddBarcodeToProductResult> {
    try {
        const { distributorId } = await getDistributorContext()
        const productId = String(params.productId || '').trim()
        const normalizedBarcode = normalizeBarcode(String(params.barcode || ''))

        if (!productId) {
            return { success: false, error: 'Product is required.' }
        }

        if (!normalizedBarcode || normalizedBarcode.length < 6) {
            return { success: false, error: 'Invalid barcode. Minimum length is 6.' }
        }

        const supabase = await createClient()

        let productResult = await supabase
            .from('products')
            .select('id,name,barcode')
            .eq('id', productId)
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)
            .maybeSingle()

        if (productResult.error && productResult.error.code === '42703') {
            productResult = await supabase
                .from('products')
                .select('id,name,barcode')
                .eq('id', productId)
                .eq('distributor_id', distributorId)
                .maybeSingle()
        }

        if (productResult.error) {
            return { success: false, error: productResult.error.message || 'Failed to load product.' }
        }

        if (!productResult.data) {
            return { success: false, error: 'Product not found for this distributor.' }
        }

        const legacyBarcode = normalizeBarcode(String((productResult.data as any).barcode || ''))

        const sameProductAliasResult = await supabase
            .from('product_barcodes')
            .select('id')
            .eq('product_id', productId)
            .eq('barcode', normalizedBarcode)
            .limit(1)
            .maybeSingle()

        if (!sameProductAliasResult.error && sameProductAliasResult.data) {
            return {
                success: true,
                barcode: normalizedBarcode,
                alreadyAdded: true
            }
        }

        if (sameProductAliasResult.error && !isMissingProductBarcodesTableError(sameProductAliasResult.error)) {
            return { success: false, error: sameProductAliasResult.error.message || 'Failed to validate barcode aliases.' }
        }

        if (legacyBarcode === normalizedBarcode) {
            return {
                success: true,
                barcode: normalizedBarcode,
                alreadyAdded: true
            }
        }

        const collision = await findBarcodeCollision({
            supabase,
            distributorId,
            barcodes: [normalizedBarcode],
            excludeProductId: productId
        })

        if (collision) {
            return {
                success: false,
                error: `This barcode is already assigned to another product: ${collision.productName}`
            }
        }

        if (sameProductAliasResult.error && isMissingProductBarcodesTableError(sameProductAliasResult.error)) {
            return {
                success: false,
                error: 'Barcode alias table is missing. Apply migration 20260321000001_product_barcodes.sql.'
            }
        }

        let shouldSetPrimary = !legacyBarcode
        const primaryAliasResult = await supabase
            .from('product_barcodes')
            .select('id', { count: 'exact', head: true })
            .eq('product_id', productId)
            .eq('is_primary', true)

        if (!primaryAliasResult.error) {
            shouldSetPrimary = shouldSetPrimary || Number(primaryAliasResult.count || 0) === 0
        } else if (!isMissingProductBarcodesTableError(primaryAliasResult.error)) {
            return {
                success: false,
                error: primaryAliasResult.error.message || 'Failed to validate existing primary barcode.'
            }
        }

        const insertAliasResult = await supabase
            .from('product_barcodes')
            .insert({
                product_id: productId,
                distributor_id: distributorId,
                barcode: normalizedBarcode,
                is_primary: shouldSetPrimary
            })

        if (insertAliasResult.error) {
            if (insertAliasResult.error.code === '23505') {
                const postConflictCollision = await findBarcodeCollision({
                    supabase,
                    distributorId,
                    barcodes: [normalizedBarcode],
                    excludeProductId: productId
                })

                if (postConflictCollision) {
                    return {
                        success: false,
                        error: `This barcode is already assigned to another product: ${postConflictCollision.productName}`
                    }
                }

                const existingSameProduct = await supabase
                    .from('product_barcodes')
                    .select('id')
                    .eq('product_id', productId)
                    .eq('barcode', normalizedBarcode)
                    .limit(1)
                    .maybeSingle()

                if (!existingSameProduct.error && existingSameProduct.data) {
                    return { success: true, barcode: normalizedBarcode, alreadyAdded: true }
                }

                return {
                    success: false,
                    error: 'This barcode is already assigned to another product in your inventory.'
                }
            }

            return { success: false, error: insertAliasResult.error.message || 'Failed to save barcode alias.' }
        }

        if (!legacyBarcode) {
            const { error: syncLegacyError } = await supabase
                .from('products')
                .update({ barcode: normalizedBarcode })
                .eq('id', productId)
                .eq('distributor_id', distributorId)

            if (syncLegacyError) {
                return { success: false, error: syncLegacyError.message || 'Failed to sync primary barcode.' }
            }
        }

        if (process.env.NODE_ENV !== 'production') {
            console.info('[inventory:addBarcodeToProduct]', {
                distributorId,
                productId,
                barcode: normalizedBarcode
            })
        }

        revalidatePath('/distributor/inventory')
        return {
            success: true,
            barcode: normalizedBarcode,
            alreadyAdded: false
        }
    } catch (error: any) {
        return {
            success: false,
            error: error?.message || 'Failed to add barcode.'
        }
    }
}

async function syncProductBarcodeMappings(params: {
    supabase: InventorySupabaseClient
    distributorId: string
    productId: string
    entries: SubmittedBarcodeEntry[]
    primaryBarcode: string | null
}) {
    const { supabase, distributorId, productId, entries, primaryBarcode } = params
    const barcodes = entries.map((entry) => entry.barcode)
    const desiredPrimary = primaryBarcode && barcodes.includes(primaryBarcode)
        ? primaryBarcode
        : (barcodes[0] ?? null)

    if (barcodes.length === 0) {
        const clearResult = await supabase
            .from('product_barcodes')
            .delete()
            .eq('product_id', productId)

        if (clearResult.error && !isMissingProductBarcodesTableError(clearResult.error)) {
            throw new Error(clearResult.error.message || 'Failed to clear barcode aliases')
        }

        const { error: updateLegacyError } = await supabase
            .from('products')
            .update({ barcode: null })
            .eq('id', productId)
            .eq('distributor_id', distributorId)

        if (updateLegacyError) {
            throw new Error(updateLegacyError.message || 'Failed to sync primary barcode')
        }

        return
    }

    const existingResult = await supabase
        .from('product_barcodes')
        .select('barcode')
        .eq('product_id', productId)

    if (existingResult.error && !isMissingProductBarcodesTableError(existingResult.error)) {
        throw new Error(existingResult.error.message || 'Failed to load barcode aliases')
    }

    if (!existingResult.error) {
        const existingBarcodes = (existingResult.data ?? []).map((row: any) => String(row.barcode || '')).filter(Boolean)
        const toDelete = existingBarcodes.filter((barcode) => !barcodes.includes(barcode))

        if (toDelete.length > 0) {
            const deleteResult = await supabase
                .from('product_barcodes')
                .delete()
                .eq('product_id', productId)
                .in('barcode', toDelete)

            if (deleteResult.error) {
                throw new Error(deleteResult.error.message || 'Failed to remove barcode aliases')
            }
        }

        const upsertPayload = barcodes.map((barcode) => ({
            product_id: productId,
            distributor_id: distributorId,
            barcode,
            is_primary: false
        }))

        const upsertResult = await supabase
            .from('product_barcodes')
            .upsert(upsertPayload, { onConflict: 'product_id,barcode' })

        if (upsertResult.error) {
            throw new Error(upsertResult.error.message || 'Failed to save barcode aliases')
        }

        const clearPrimaryResult = await supabase
            .from('product_barcodes')
            .update({ is_primary: false })
            .eq('product_id', productId)
            .eq('is_primary', true)

        if (clearPrimaryResult.error) {
            throw new Error(clearPrimaryResult.error.message || 'Failed to reset primary barcode')
        }

        if (desiredPrimary) {
            const setPrimaryResult = await supabase
                .from('product_barcodes')
                .update({ is_primary: true })
                .eq('product_id', productId)
                .eq('barcode', desiredPrimary)

            if (setPrimaryResult.error) {
                throw new Error(setPrimaryResult.error.message || 'Failed to set primary barcode')
            }
        }
    }

    const { error: updateLegacyError } = await supabase
        .from('products')
        .update({ barcode: desiredPrimary })
        .eq('id', productId)
        .eq('distributor_id', distributorId)

    if (updateLegacyError) {
        throw new Error(updateLegacyError.message || 'Failed to sync primary barcode')
    }
}

async function validateCategoryNodeSelection({
    supabase,
    distributorId,
    categoryId,
    categoryNodeId,
}: {
    supabase: InventorySupabaseClient
    distributorId: string
    categoryId: string | null
    categoryNodeId: string | null
}): Promise<InventoryActionState | null> {
    if (!categoryNodeId) return null
    if (!categoryId) {
        return { error: 'Select a category before selecting a sub-category.' }
    }

    // Verified in schema/migrations: products.category_node_id references category_nodes.id,
    // and category_nodes.category_id references categories.id.
    const { data, error } = await supabase
        .from('category_nodes')
        .select('id,category_id')
        .eq('id', categoryNodeId)
        .eq('distributor_id', distributorId)
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error('validateCategoryNodeSelection Error:', error)
        return { error: 'Unable to validate selected sub-category. Please try again.' }
    }

    if (!data || !isCategoryNodeInCategory(data, categoryId)) {
        return { error: 'Selected sub-category does not belong to the selected category.' }
    }

    return null
}

export async function deleteProduct(productId: string) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // Soft delete
    const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('distributor_id', distributorId)

    if (error) throw error
    revalidatePath('/distributor/inventory')
}

export async function createProductAction(
    prevState: InventoryActionState,
    formData: FormData
): Promise<InventoryActionState> {
    try {
        const { distributorId } = await getDistributorContext()
        const parseRequiredNumber = (key: string): number | null => {
            const raw = formData.get(key)
            if (raw === null || raw === undefined || raw === '') return null
            const n = Number(raw)
            return Number.isFinite(n) ? n : null
        }
        const parseOptionalNumber = (key: string): number | null | typeof Number.NaN => {
            const raw = formData.get(key)
            if (raw === null || raw === undefined || raw === '') return null
            const n = Number(raw)
            return Number.isFinite(n) ? n : Number.NaN
        }
        const name = String(formData.get('name') || '').trim()
        const sku = String(formData.get('sku') || '').trim() || null
        const category_id = String(formData.get('category_id') || '').trim() || null
        const category_node_id = String(formData.get('category_node_id') || '').trim() || null

        const cost_price = parseRequiredNumber('cost_price')
        const sell_price = parseRequiredNumber('sell_price')

        // Extended pricing fields
        const cost_case = parseOptionalNumber('cost_case')
        const price_case = parseOptionalNumber('price_case')
        const cost_mode = String(formData.get('cost_mode') || 'unit')
        const price_mode = String(formData.get('price_mode') || 'unit')
        const normalizedCostMode: 'unit' | 'case' = cost_mode === 'case' ? 'case' : 'unit'
        const normalizedPriceMode: 'unit' | 'case' = price_mode === 'case' ? 'case' : 'unit'
        const stock_mode = String(formData.get('stock_mode') || 'pieces')

        const stock_pieces = parseRequiredNumber('stock_qty')

        const stock_locked = formData.get('stock_locked') === 'true' || formData.get('stock_locked') === 'on'
        const locked_stock_qty_raw = formData.get('locked_stock_qty')
        const locked_stock_qty = stock_locked && locked_stock_qty_raw ? Number(locked_stock_qty_raw) : null
        const final_stock_pieces = stock_locked && locked_stock_qty !== null ? locked_stock_qty : (stock_pieces ?? 0)

        const allow_case = formData.get('allow_case') === 'on'
        const allow_piece = formData.get('allow_piece') === 'on'
        const units_per_case = Number(formData.get('units_per_case') || 1)
        const low_stock_threshold = Number(formData.get('low_stock_threshold') || 5)

        if (!name) return { error: 'Product name required' }
        if (cost_price === null || sell_price === null || stock_pieces === null) return { error: 'Invalid numeric input' }
        if (!Number.isFinite(cost_price) || !Number.isFinite(sell_price) || !Number.isFinite(stock_pieces)) return { error: 'Invalid numeric input' }
        if ((cost_case as any) !== null && !Number.isFinite(cost_case as number)) return { error: 'Invalid case cost' }
        if ((price_case as any) !== null && !Number.isFinite(price_case as number)) return { error: 'Invalid case price' }
        if (!Number.isFinite(units_per_case) || !Number.isFinite(low_stock_threshold)) return { error: 'Invalid numeric input' }
        if (allow_case && units_per_case < 1) return { error: 'Units per case must be at least 1' }
        if (!allow_case && !allow_piece) return { error: 'Must allow at least cases or pieces' }
        if (cost_price < 0 || sell_price < 0) return { error: 'Prices must be 0 or greater' }
        if ((normalizedCostMode === 'case' || normalizedPriceMode === 'case') && safeUnitsPerCase(units_per_case) === null) {
            return { error: 'Set units per case to use case pricing.' }
        }

        const resolvedCostPair = resolveUnitCasePair({
            mode: normalizedCostMode,
            unitPrice: cost_price,
            casePrice: cost_case as number | null,
            unitsPerCase: units_per_case
        })
        const resolvedSellPair = resolveUnitCasePair({
            mode: normalizedPriceMode,
            unitPrice: sell_price,
            casePrice: price_case as number | null,
            unitsPerCase: units_per_case
        })

        if (
            resolvedCostPair.unitPrice === null ||
            resolvedSellPair.unitPrice === null
        ) {
            return { error: 'Invalid pricing input' }
        }
        if (
            resolvedCostPair.unitPrice < 0 ||
            resolvedSellPair.unitPrice < 0 ||
            (resolvedCostPair.casePrice !== null && resolvedCostPair.casePrice < 0) ||
            (resolvedSellPair.casePrice !== null && resolvedSellPair.casePrice < 0)
        ) {
            return { error: 'Prices must be 0 or greater' }
        }

        const parsedBarcodes = parseBarcodesFromForm(formData)
        if (parsedBarcodes.error) return { error: parsedBarcodes.error }

        const supabase = await createClient()
        const categoryNodeValidation = await validateCategoryNodeSelection({
            supabase,
            distributorId,
            categoryId: category_id,
            categoryNodeId: category_node_id,
        })
        if (categoryNodeValidation) return categoryNodeValidation

        const collision = await findBarcodeCollision({
            supabase,
            distributorId,
            barcodes: parsedBarcodes.entries.map((entry) => entry.barcode)
        })

        if (collision) {
            return { error: `Barcode already assigned to ${collision.productName}.` }
        }

        const { data: inserted, error } = await supabase
            .from('products')
            .insert({
                distributor_id: distributorId,
                category_id,
                category_node_id,
                name,
                sku,
                barcode: parsedBarcodes.primaryBarcode,
                cost_price: resolvedCostPair.unitPrice,
                sell_price: resolvedSellPair.unitPrice,
                cost_case: resolvedCostPair.casePrice,
                price_case: resolvedSellPair.casePrice,
                cost_mode: normalizedCostMode,
                price_mode: normalizedPriceMode,
                stock_qty: final_stock_pieces,    // Sync legacy
                stock_pieces: final_stock_pieces, // Canonical
                stock_mode,                       // Preference
                stock_locked,
                locked_stock_qty,
                allow_case,
                allow_piece,
                units_per_case: allow_case ? units_per_case : null,
                low_stock_threshold,

                // Canonical Field Sync
                cost_per_unit: resolvedCostPair.unitPrice,
                sell_per_unit: resolvedSellPair.unitPrice,
                cost_per_case: resolvedCostPair.casePrice,
                sell_per_case: resolvedSellPair.casePrice
            })
            .select('id')
            .single()

        if (error) {
            console.error('createProductAction Supabase Error:', error)
            if (isBarcodeConstraintError(error) || error.message?.includes('products_distributor_barcode_uniq')) {
                return { error: 'This barcode is already assigned to another product in your inventory.' }
            }
            if (error.message?.includes('schema cache') || error.message?.includes('Could not find')) {
                return { error: 'Database schema is updating. Please apply the latest migration in Supabase SQL Editor and reload the schema cache (Settings → API → Reload), then try again.' }
            }
            return { error: error.message, details: error }
        }

        try {
            await syncProductBarcodeMappings({
                supabase,
                distributorId,
                productId: String(inserted.id),
                entries: parsedBarcodes.entries,
                primaryBarcode: parsedBarcodes.primaryBarcode
            })
        } catch (syncError: any) {
            if (isBarcodeConstraintError(syncError)) {
                return { error: 'This barcode is already assigned to another product in your inventory.' }
            }
            return { error: syncError?.message || 'Failed to save barcode aliases.' }
        }

        revalidatePath('/distributor/inventory')
        return { success: true, error: null }
    } catch (e: any) {
        console.error('createProductAction Exception:', e)
        return { error: e.message || 'An unexpected error occurred' }
    }
}

export async function updateProductAction(
    prevState: InventoryActionState,
    formData: FormData
): Promise<InventoryActionState> {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        const id = String(formData.get('id'))
        const name = String(formData.get('name') || '').trim()
        const sku = String(formData.get('sku') || '').trim() || null
        const category_id = String(formData.get('category_id') || '').trim() || null
        const category_node_id = String(formData.get('category_node_id') || '').trim() || null

        const parsedBarcodes = parseBarcodesFromForm(formData)
        if (parsedBarcodes.error) return { error: parsedBarcodes.error }

        // Safe number parser: returns undefined for empty/missing values
        // This prevents overwriting existing DB values with 0
        const safeNum = (key: string): number | undefined => {
            const raw = formData.get(key)
            if (raw === null || raw === undefined || raw === '') return undefined
            const n = Number(raw)
            return isNaN(n) ? undefined : n
        }

        const sell_price = safeNum('sell_price') // sell_price always required
        const cost_price = safeNum('cost_price') // preserve existing if empty
        const cost_case = safeNum('cost_case')
        const price_case = safeNum('price_case')

        const cost_mode = String(formData.get('cost_mode') || 'unit')
        const price_mode = String(formData.get('price_mode') || 'unit')
        const normalizedCostMode: 'unit' | 'case' = cost_mode === 'case' ? 'case' : 'unit'
        const normalizedPriceMode: 'unit' | 'case' = price_mode === 'case' ? 'case' : 'unit'
        const stock_mode = String(formData.get('stock_mode') || 'pieces')

        const stock_pieces = safeNum('stock_qty')

        const stock_locked = formData.get('stock_locked') === 'true' || formData.get('stock_locked') === 'on'
        const locked_stock_qty_raw = formData.get('locked_stock_qty')
        const locked_stock_qty = stock_locked && locked_stock_qty_raw ? Number(locked_stock_qty_raw) : null
        const final_stock_pieces = stock_locked && locked_stock_qty !== null ? locked_stock_qty : (stock_pieces ?? 0)

        const allow_case = formData.get('allow_case') === 'on'
        const allow_piece = formData.get('allow_piece') === 'on'
        const units_per_case = Number(formData.get('units_per_case') || 1)
        const low_stock_threshold = Number(formData.get('low_stock_threshold') || 5)

        if (!id) return { error: 'Product ID required' }
        if (!name) return { error: 'Product name required' }
        if (sell_price === undefined) return { error: 'Sell price is required' }
        if (stock_pieces === undefined) return { error: 'Stock quantity is required' }
        if (!Number.isFinite(sell_price) || !Number.isFinite(stock_pieces)) return { error: 'Invalid numeric input' }
        if (!Number.isFinite(units_per_case) || !Number.isFinite(low_stock_threshold)) return { error: 'Invalid numeric input' }
        if (allow_case && units_per_case < 1) return { error: 'Units per case must be at least 1' }
        if (!allow_case && !allow_piece) return { error: 'Must allow at least cases or pieces' }
        if ((normalizedCostMode === 'case' || normalizedPriceMode === 'case') && safeUnitsPerCase(units_per_case) === null) {
            return { error: 'Set units per case to use case pricing.' }
        }
        if (
            sell_price < 0 ||
            (cost_price !== undefined && cost_price < 0) ||
            (cost_case !== undefined && cost_case < 0) ||
            (price_case !== undefined && price_case < 0)
        ) {
            return { error: 'Prices must be 0 or greater' }
        }

        const resolvedSellPair = resolveUnitCasePair({
            mode: normalizedPriceMode,
            unitPrice: sell_price,
            casePrice: price_case,
            unitsPerCase: units_per_case
        })
        const resolvedCostPair = resolveUnitCasePair({
            mode: normalizedCostMode,
            unitPrice: cost_price,
            casePrice: cost_case,
            unitsPerCase: units_per_case
        })

        if (resolvedSellPair.unitPrice === null || resolvedSellPair.unitPrice < 0) {
            return { error: 'Sell price is required' }
        }
        if (
            (resolvedSellPair.casePrice !== null && resolvedSellPair.casePrice < 0) ||
            (resolvedCostPair.unitPrice !== null && resolvedCostPair.unitPrice < 0) ||
            (resolvedCostPair.casePrice !== null && resolvedCostPair.casePrice < 0)
        ) {
            return { error: 'Prices must be 0 or greater' }
        }

        const collision = await findBarcodeCollision({
            supabase,
            distributorId,
            barcodes: parsedBarcodes.entries.map((entry) => entry.barcode),
            excludeProductId: id
        })

        if (collision) {
            return { error: `Barcode already assigned to ${collision.productName}.` }
        }

        const categoryNodeValidation = await validateCategoryNodeSelection({
            supabase,
            distributorId,
            categoryId: category_id,
            categoryNodeId: category_node_id,
        })
        if (categoryNodeValidation) return categoryNodeValidation

        // Build update payload — only include cost/price fields when they have values
        // This prevents bulk pricing (which only updates sell_price) from zeroing cost
        const updatePayload: Record<string, any> = {
            name,
            sku,
            barcode: parsedBarcodes.primaryBarcode,
            category_id,
            category_node_id,
            sell_price: resolvedSellPair.unitPrice,
            cost_mode: normalizedCostMode,
            price_mode: normalizedPriceMode,
            stock_qty: final_stock_pieces,
            stock_pieces: final_stock_pieces,
            stock_mode,
            stock_locked,
            locked_stock_qty,
            allow_case,
            allow_piece,
            units_per_case: allow_case ? units_per_case : null,
            low_stock_threshold,

            // Canonical Field Sync
            sell_per_unit: resolvedSellPair.unitPrice
        }

        // Only include cost/price fields if they have real values (not empty/undefined)
        if (resolvedCostPair.unitPrice !== null) {
            updatePayload.cost_price = resolvedCostPair.unitPrice
            updatePayload.cost_per_unit = resolvedCostPair.unitPrice
        }
        if (resolvedCostPair.casePrice !== null) {
            updatePayload.cost_case = resolvedCostPair.casePrice
            updatePayload.cost_per_case = resolvedCostPair.casePrice
        }
        if (resolvedSellPair.casePrice !== null) {
            updatePayload.price_case = resolvedSellPair.casePrice
            updatePayload.sell_per_case = resolvedSellPair.casePrice
        }

        const { error } = await supabase
            .from('products')
            .update(updatePayload)
            .eq('id', id)
            .eq('distributor_id', distributorId)

        if (error) {
            console.error('updateProductAction Error:', error)
            if (isBarcodeConstraintError(error) || error.message?.includes('products_distributor_barcode_uniq')) {
                return { error: 'This barcode is already assigned to another product in your inventory.' }
            }
            if (error.message?.includes('schema cache') || error.message?.includes('Could not find')) {
                return { error: 'Database schema is updating. Please apply the latest migration in Supabase SQL Editor and reload the schema cache (Settings → API → Reload), then try again.' }
            }
            return { error: error.message }
        }

        try {
            await syncProductBarcodeMappings({
                supabase,
                distributorId,
                productId: id,
                entries: parsedBarcodes.entries,
                primaryBarcode: parsedBarcodes.primaryBarcode
            })
        } catch (syncError: any) {
            if (isBarcodeConstraintError(syncError)) {
                return { error: 'This barcode is already assigned to another product in your inventory.' }
            }
            return { error: syncError?.message || 'Failed to save barcode aliases.' }
        }

        revalidatePath('/distributor/inventory')
        return { success: true, error: null }
    } catch (e: any) {
        console.error('updateProductAction Exception:', e)
        return { error: e.message || 'An unexpected error occurred' }
    }
}
