'use server'

import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import type { PriceUnit } from '@/lib/pricing/types'
import type { BulkPricingSaveRow } from '@/lib/pricing/bulkEdit'
import { safeUnitsPerCase } from '@/lib/pricing/display'
import { parseNumericInput, parsePriceUnit } from '@/lib/pricing/priceValidation'
import {
    getPriceUnitForBulkTarget,
    resolveBulkPriceFieldTarget,
    toLegacyBulkPriceField,
    type BulkPriceFieldTarget,
    type LegacyBulkPriceField
} from '@/lib/pricing/bulkPriceTargets'

type ScopeType = 'category' | 'category_node'
type ApplyMode = 'base_only' | 'base_and_overrides' | 'overrides_only'

type LoadedScopeProduct = {
    id: string
    name: string
    sku: string | null
    category_id: string | null
    category_node_id: string | null
    category: string | null
    node: string | null
    allow_case: boolean
    units_per_case: number | null
    sell_per_unit: number | null
    sell_per_case: number | null
    cost_per_unit: number | null
    cost_per_case: number | null
}

function toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function toPriceCents(value: number | null): number | null {
    return value === null ? null : Math.round(value * 100)
}

async function getScopedNodeIds(supabase: Awaited<ReturnType<typeof createClient>>, distributorId: string, scopeId: string) {
    const { data: allNodes, error } = await supabase
        .from('category_nodes')
        .select('id, parent_id')
        .eq('distributor_id', distributorId)

    if (error) throw error

    const nodeIds = new Set<string>([scopeId])
    let changed = true

    while (changed) {
        changed = false
        for (const node of allNodes || []) {
            if (node.parent_id && nodeIds.has(node.parent_id) && !nodeIds.has(node.id)) {
                nodeIds.add(node.id)
                changed = true
            }
        }
    }

    return Array.from(nodeIds)
}

function normalizeLoadedProduct(row: any, catMap: Map<string, string>, nodeMap: Map<string, string>): LoadedScopeProduct {
    return {
        id: String(row.id),
        name: String(row.name || ''),
        sku: row.sku ? String(row.sku) : null,
        category_id: row.category_id ? String(row.category_id) : null,
        category_node_id: row.category_node_id ? String(row.category_node_id) : null,
        category: row.category_id ? (catMap.get(String(row.category_id)) ?? null) : null,
        node: row.category_node_id ? (nodeMap.get(String(row.category_node_id)) ?? null) : null,
        allow_case: row.allow_case !== false,
        units_per_case: row.units_per_case == null ? null : Number(row.units_per_case),
        sell_per_unit: toNullableNumber(row.sell_per_unit ?? row.sell_price),
        sell_per_case: toNullableNumber(row.sell_per_case ?? row.price_case),
        cost_per_unit: toNullableNumber(row.cost_per_unit ?? row.cost_price),
        cost_per_case: toNullableNumber(row.cost_per_case ?? row.cost_case)
    }
}

function scopeMatchesProduct(row: any, scope: { type: ScopeType; id: string }, scopeNodeIds: string[]) {
    if (scope.type === 'category') {
        return row.category_id === scope.id
    }

    return scopeNodeIds.includes(String(row.category_node_id || ''))
}

function buildProductUpdatePayload(row: BulkPricingSaveRow) {
    const payload: Record<string, number | null> = {}

    if (row.hasSellUnitChange) {
        payload.sell_per_unit = row.final.sell_per_unit
        payload.sell_price = row.final.sell_per_unit
    }

    if (row.hasSellCaseChange) {
        payload.sell_per_case = row.final.sell_per_case
        payload.price_case = row.final.sell_per_case
    }

    if (row.hasCostUnitChange) {
        payload.cost_per_unit = row.final.cost_per_unit
        payload.cost_price = row.final.cost_per_unit
    }

    if (row.hasCostCaseChange) {
        payload.cost_per_case = row.final.cost_per_case
        payload.cost_case = row.final.cost_per_case
    }

    return payload
}

function validateResolvedRows(rows: BulkPricingSaveRow[], currentProducts: Map<string, any>): string | null {
    for (const row of rows) {
        const current = currentProducts.get(row.productId)
        if (!current) {
            return 'One or more products could not be reloaded. Please load the scope again.'
        }

        const nextSellUnit = row.final.sell_per_unit
        const nextSellCase = row.final.sell_per_case
        const nextCostUnit = row.final.cost_per_unit
        const nextCostCase = row.final.cost_per_case

        if (row.hasSellUnitChange && nextSellUnit === null) {
            return `Sell price is required for ${current.name}.`
        }
        if (row.hasCostUnitChange && nextCostUnit === null) {
            return `Cost price is required for ${current.name}.`
        }
        if (row.hasSellCaseChange && nextSellCase === null) {
            return `Case sell price is required for ${current.name}.`
        }
        if (row.hasCostCaseChange && nextCostCase === null) {
            return `Case cost is required for ${current.name}.`
        }

        const values = [nextSellUnit, nextSellCase, nextCostUnit, nextCostCase].filter((value) => value !== null) as number[]
        if (values.some((value) => !Number.isFinite(value) || value < 0)) {
            return `Prices must be 0 or greater for ${current.name}.`
        }

        if ((row.hasSellCaseChange || row.hasCostCaseChange) && current.allow_case === false) {
            return `Case pricing is not available for ${current.name}.`
        }
        if ((row.hasSellCaseChange || row.hasCostCaseChange) && safeUnitsPerCase(current.units_per_case) === null) {
            return `Set units per case to use case pricing for ${current.name}.`
        }
    }

    return null
}

async function persistResolvedProducts(params: {
    supabase: Awaited<ReturnType<typeof createClient>>
    distributorId: string
    rows: BulkPricingSaveRow[]
    currentProducts: Map<string, any>
}) {
    const { supabase, distributorId, rows, currentProducts } = params
    const nextRows = rows.map((row) => ({
        ...currentProducts.get(row.productId),
        ...buildProductUpdatePayload(row),
        updated_at: new Date().toISOString()
    }))

    const { error: upsertError } = await supabase
        .from('products')
        .upsert(nextRows as any[], { onConflict: 'id' })

    if (!upsertError) {
        return { ok: true as const }
    }

    console.error('Resolved bulk pricing upsert failed, falling back to row updates:', upsertError)

    for (const row of rows) {
        const payload = buildProductUpdatePayload(row)
        if (Object.keys(payload).length === 0) continue

        const { error } = await supabase
            .from('products')
            .update({
                ...payload,
                updated_at: new Date().toISOString()
            } as any)
            .eq('id', row.productId)
            .eq('distributor_id', distributorId)

        if (error) {
            return { ok: false as const, error: error.message }
        }
    }

    return { ok: true as const }
}

async function syncVendorOverrides(params: {
    supabase: Awaited<ReturnType<typeof createClient>>
    distributorId: string
    vendorIds: string[] | null
    rows: BulkPricingSaveRow[]
    currentProducts: Map<string, any>
}) {
    const { supabase, distributorId, vendorIds, rows, currentProducts } = params
    const sellRows = rows.filter((row) => row.hasSellUnitChange || row.hasSellCaseChange)
    if (sellRows.length === 0) {
        return { ok: true as const, count: 0 }
    }

    let targetVendorIds: string[] = []
    if (vendorIds && vendorIds.length > 0) {
        const { data, error } = await supabase
            .from('distributor_vendors')
            .select('vendor_id')
            .eq('distributor_id', distributorId)
            .in('vendor_id', vendorIds)

        if (error) {
            return { ok: false as const, error: error.message }
        }

        targetVendorIds = (data || []).map((row) => String(row.vendor_id))
    } else {
        const { data, error } = await supabase
            .from('distributor_vendors')
            .select('vendor_id')
            .eq('distributor_id', distributorId)

        if (error) {
            return { ok: false as const, error: error.message }
        }

        targetVendorIds = (data || []).map((row) => String(row.vendor_id))
    }

    if (targetVendorIds.length === 0) {
        return { ok: true as const, count: 0 }
    }

    const changedProductIds = sellRows.map((row) => row.productId)
    const { data: existingRows, error: existingError } = await supabase
        .from('vendor_price_overrides')
        .select('vendor_id, product_id, price_per_unit, price_per_case')
        .eq('distributor_id', distributorId)
        .in('vendor_id', targetVendorIds)
        .in('product_id', changedProductIds)

    if (existingError) {
        return { ok: false as const, error: existingError.message }
    }

    const existingMap = new Map<string, { price_per_unit: number | null; price_per_case: number | null }>()
    for (const row of existingRows || []) {
        existingMap.set(`${row.vendor_id}:${row.product_id}`, {
            price_per_unit: toNullableNumber(row.price_per_unit),
            price_per_case: toNullableNumber(row.price_per_case)
        })
    }

    const upsertRows = targetVendorIds.flatMap((vendorId) =>
        sellRows.map((row) => {
            const currentProduct = currentProducts.get(row.productId)
            const existing = existingMap.get(`${vendorId}:${row.productId}`)
            const unitsPerCase = safeUnitsPerCase(currentProduct?.units_per_case) ?? 1
            const nextUnitPrice = row.final.sell_per_unit
            const nextCasePrice = row.hasSellCaseChange
                ? row.final.sell_per_case
                : (existing?.price_per_case ?? null)

            const centsSource = nextUnitPrice
                ?? (nextCasePrice === null ? null : Number((nextCasePrice / unitsPerCase).toFixed(2)))

            return {
                distributor_id: distributorId,
                vendor_id: vendorId,
                product_id: row.productId,
                price_per_unit: nextUnitPrice,
                price_per_case: nextCasePrice,
                price_cents: centsSource === null ? 0 : Math.round(centsSource * 100),
                updated_at: new Date().toISOString()
            }
        })
    )

    const validRows = upsertRows.filter((row) => row.price_per_unit !== null || row.price_per_case !== null)
    if (validRows.length === 0) {
        return { ok: true as const, count: 0 }
    }

    const { error } = await supabase
        .from('vendor_price_overrides')
        .upsert(validRows as any[], {
            onConflict: 'distributor_id,vendor_id,product_id'
        })

    if (error) {
        return { ok: false as const, error: error.message }
    }

    return { ok: true as const, count: validRows.length }
}

async function insertResolvedPriceAudit(params: {
    supabase: Awaited<ReturnType<typeof createClient>>
    distributorId: string
    scope: { type: ScopeType; id: string }
    applyMode: ApplyMode
    rows: BulkPricingSaveRow[]
    currentProducts: Map<string, any>
}) {
    const { supabase, distributorId, scope, applyMode, rows, currentProducts } = params
    const sellRows = rows.filter((row) => row.hasSellUnitChange || row.hasSellCaseChange)
    if (sellRows.length === 0) {
        return { batchId: null as string | null }
    }

    try {
        const { data: batch, error: batchError } = await supabase
            .from('price_change_batches')
            .insert({
                distributor_id: distributorId,
                created_by: distributorId,
                scope: scope.type,
                scope_id: scope.id,
                adjustment_type: 'resolved_save',
                adjustment_value: 0,
                apply_mode: applyMode,
                change_type: 'resolved',
                field: 'mixed',
                value_applied: 0,
                reason: 'bulk_pricing_editor'
            })
            .select('id')
            .single()

        if (batchError || !batch?.id) {
            console.error('Resolved bulk pricing audit batch error:', batchError)
            return { batchId: null as string | null }
        }

        const items = sellRows.map((row) => {
            const current = currentProducts.get(row.productId)
            const oldUnitPrice = toNullableNumber(current?.sell_per_unit ?? current?.sell_price)
            return {
                batch_id: batch.id,
                product_id: row.productId,
                product_name: current?.name ?? null,
                old_price_cents: toPriceCents(oldUnitPrice),
                new_price_cents: toPriceCents(row.final.sell_per_unit)
            }
        })

        const { error: itemsError } = await supabase
            .from('price_change_items')
            .insert(items as any[])

        if (itemsError) {
            console.error('Resolved bulk pricing audit item error:', itemsError)
        }

        return { batchId: String(batch.id) }
    } catch (error) {
        console.error('Resolved bulk pricing audit failure:', error)
        return { batchId: null as string | null }
    }
}

function revalidatePricingPaths() {
    revalidatePath('/distributor/inventory')
    revalidatePath('/distributor/bulk-pricing')
    revalidatePath('/distributor/vendor-pricing')
    revalidatePath('/vendor/catalog', 'layout')
    revalidatePath('/vendor/cart', 'layout')
}

export async function executeBulkPriceAdjustment(params: {
    distributorId: string
    scope: {
        type: ScopeType
        id: string
    }
    applyMode: ApplyMode
    vendorIds: string[] | null
    changeType: 'percent' | 'fixed' | 'set'
    value: number
    fieldTarget?: BulkPriceFieldTarget | LegacyBulkPriceField
    field?: BulkPriceFieldTarget | LegacyBulkPriceField
    priceUnit: PriceUnit
}) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        if (params.distributorId !== distributorId) {
            return { ok: false, error: 'Distributor mismatch' }
        }

        const resolvedFieldTarget = resolveBulkPriceFieldTarget({
            fieldTarget: params.fieldTarget,
            field: params.field
        })
        if (!resolvedFieldTarget.ok) {
            return { ok: false, error: resolvedFieldTarget.error }
        }

        const parsedUnit = parsePriceUnit(params.priceUnit)
        if (!parsedUnit.ok) {
            return { ok: false, error: parsedUnit.error }
        }

        const expectedUnit = getPriceUnitForBulkTarget(resolvedFieldTarget.value)
        if (parsedUnit.value !== expectedUnit) {
            return {
                ok: false,
                error: `Invalid price unit for ${resolvedFieldTarget.value}. Expected ${expectedUnit}.`
            }
        }

        const parsedValue = parseNumericInput(params.value, 'value', {
            allowNegative: params.changeType !== 'set',
            roundTo: 4
        })
        if (!parsedValue.ok) {
            return { ok: false, error: parsedValue.error }
        }

        const rpcPayload = {
            p_distributor_id: distributorId,
            p_scope_type: params.scope.type,
            p_scope_id: params.scope.id,
            p_apply_mode: params.applyMode,
            p_vendor_ids: params.vendorIds,
            p_change_type: params.changeType,
            p_value: parsedValue.value,
            p_field: toLegacyBulkPriceField(resolvedFieldTarget.value),
            p_price_unit: parsedUnit.value
        }

        const { data, error } = await supabase.rpc('bulk_adjust_prices_atomic', rpcPayload)

        if (error) {
            console.error('Bulk price adjustment RPC error:', error)
            if (error.code === 'PGRST202') {
                return { ok: false, error: 'The bulk_adjust_prices_atomic function is missing. Please apply migration 20260315000001_bulk_case_unit_sync.sql in Supabase SQL Editor.' }
            }
            return { ok: false, error: error.message }
        }

        if (data?.error) {
            if (resolvedFieldTarget.value === 'COST_CASE' && data.error === 'Invalid field') {
                return { ok: false, error: 'Cost Price (Per Case) requires migration 20260313000001_bulk_pricing_cost_targets.sql. Please apply it in Supabase SQL Editor.' }
            }
            return { ok: false, error: data.error }
        }

        return { ok: true, data }
    } catch (e: any) {
        console.error('Execute bulk price adjustment error:', e)
        return { ok: false, error: e.message }
    } finally {
        revalidatePricingPaths()
    }
}

export async function fetchScopeProductCount(scopeType: ScopeType, scopeId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        let query = supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)

        if (scopeType === 'category') {
            query = query.eq('category_id', scopeId)
        } else {
            const nodeIds = await getScopedNodeIds(supabase, distributorId, scopeId)
            query = query.in('category_node_id', nodeIds)
        }

        const { count, error } = await query
        if (error) throw error
        return { ok: true, count: count || 0 }
    } catch (e: any) {
        console.error('Fetch scope product count error:', e)
        return { ok: false, count: 0, error: e.message }
    }
}

export async function fetchScopeProducts(scopeType: ScopeType, scopeId: string) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()
        const scopeNodeIds = scopeType === 'category_node'
            ? await getScopedNodeIds(supabase, distributorId, scopeId)
            : []

        let productQuery = supabase
            .from('products')
            .select(`
                id,
                name,
                sku,
                category_id,
                category_node_id,
                allow_case,
                units_per_case,
                sell_price,
                price_case,
                cost_price,
                cost_case,
                sell_per_unit,
                sell_per_case,
                cost_per_unit,
                cost_per_case
            `)
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)
            .order('name', { ascending: true })

        if (scopeType === 'category') {
            productQuery = productQuery.eq('category_id', scopeId)
        } else {
            productQuery = productQuery.in('category_node_id', scopeNodeIds)
        }

        const [
            { data: productRows, error: productError },
            { data: categories, error: categoriesError },
            { data: categoryNodes, error: nodesError }
        ] = await Promise.all([
            productQuery,
            supabase
                .from('categories')
                .select('id, name')
                .eq('distributor_id', distributorId)
                .is('deleted_at', null),
            supabase
                .from('category_nodes')
                .select('id, name')
                .eq('distributor_id', distributorId)
                .is('deleted_at', null)
        ])

        if (productError) throw productError
        if (categoriesError) throw categoriesError
        if (nodesError) throw nodesError

        const catMap = new Map((categories || []).map((row: any) => [String(row.id), String(row.name)]))
        const nodeMap = new Map((categoryNodes || []).map((row: any) => [String(row.id), String(row.name)]))

        return {
            ok: true,
            products: (productRows || []).map((row: any) => normalizeLoadedProduct(row, catMap, nodeMap))
        }
    } catch (e: any) {
        console.error('Fetch scope products error:', e)
        return { ok: false, products: [] as LoadedScopeProduct[], error: e.message }
    }
}

export async function fetchSampleProducts(scopeType: ScopeType, scopeId: string) {
    const result = await fetchScopeProducts(scopeType, scopeId)
    if (!result.ok) {
        return { ok: false, products: [], error: result.error }
    }

    return {
        ok: true,
        products: result.products.slice(0, 50)
    }
}

export async function saveResolvedBulkPricingRows(params: {
    distributorId: string
    scope: {
        type: ScopeType
        id: string
    }
    applyMode: ApplyMode
    vendorIds: string[] | null
    rows: BulkPricingSaveRow[]
}) {
    try {
        const { distributorId } = await getDistributorContext()
        const supabase = await createClient()

        if (params.distributorId !== distributorId) {
            return { ok: false, error: 'Distributor mismatch' }
        }

        if (params.applyMode === 'overrides_only') {
            return { ok: false, error: 'Row-level saves are only available when updating base pricing. Use Execute Bulk Adjustment for override-only mode.' }
        }

        if (!params.rows.length) {
            return { ok: false, error: 'There are no pricing changes to save.' }
        }

        const requestedIds = Array.from(new Set(params.rows.map((row) => row.productId)))
        const scopeNodeIds = params.scope.type === 'category_node'
            ? await getScopedNodeIds(supabase, distributorId, params.scope.id)
            : []

        const { data: currentRows, error: currentError } = await supabase
            .from('products')
            .select('*')
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)
            .in('id', requestedIds)

        if (currentError) {
            return { ok: false, error: currentError.message }
        }

        const currentProducts = new Map((currentRows || []).map((row: any) => [String(row.id), row]))
        if (currentProducts.size !== requestedIds.length) {
            return { ok: false, error: 'Some products are no longer available. Please reload the scope and try again.' }
        }

        const outOfScopeProduct = (currentRows || []).find((row: any) => !scopeMatchesProduct(row, params.scope, scopeNodeIds))
        if (outOfScopeProduct) {
            return { ok: false, error: 'Some products are no longer in the selected scope. Please reload the scope and try again.' }
        }

        const validationError = validateResolvedRows(params.rows, currentProducts)
        if (validationError) {
            return { ok: false, error: validationError }
        }

        const persisted = await persistResolvedProducts({
            supabase,
            distributorId,
            rows: params.rows,
            currentProducts
        })

        if (!persisted.ok) {
            return { ok: false, error: persisted.error }
        }

        let overridesUpserted = 0
        if (params.applyMode === 'base_and_overrides') {
            const syncResult = await syncVendorOverrides({
                supabase,
                distributorId,
                vendorIds: params.vendorIds,
                rows: params.rows,
                currentProducts
            })

            if (!syncResult.ok) {
                return { ok: false, error: syncResult.error }
            }

            overridesUpserted = syncResult.count
        }

        const audit = await insertResolvedPriceAudit({
            supabase,
            distributorId,
            scope: params.scope,
            applyMode: params.applyMode,
            rows: params.rows,
            currentProducts
        })

        revalidatePricingPaths()

        return {
            ok: true,
            data: {
                products_affected: params.rows.length,
                base_updated: params.rows.length,
                overrides_upserted: overridesUpserted,
                batch_id: audit.batchId
            }
        }
    } catch (e: any) {
        console.error('Save resolved bulk pricing rows error:', e)
        return { ok: false, error: e.message || 'Failed to save bulk pricing changes.' }
    }
}
