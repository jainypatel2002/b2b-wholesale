'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    AlertTriangle,
    CheckCircle2,
    Loader2,
    RotateCcw,
    Search,
    TrendingUp
} from 'lucide-react'
import { toast } from 'sonner'
import {
    executeBulkPriceAdjustment,
    fetchScopeProducts,
    saveResolvedBulkPricingRows
} from './actions'
import type { PriceUnit } from '@/lib/pricing/types'
import { formatMoney } from '@/lib/pricing/display'
import { parseNumericInput } from '@/lib/pricing/priceValidation'
import {
    buildBulkPricingSaveRows,
    resolveBulkPricingRows,
    validateBulkPricingRule,
    type BulkEditablePriceField,
    type BulkPricingProductRow,
    type BulkPricingRowOverrides,
    type BulkPricingRule,
    type ResolvedBulkPricingRow
} from '@/lib/pricing/bulkEdit'
import { getPriceUnitForBulkTarget, type BulkPriceFieldTarget, type CanonicalBulkPriceFieldTarget } from '@/lib/pricing/bulkPriceTargets'

type CategoryNode = { id: string; name: string; category_id: string; children: CategoryNode[] }
type Category = { id: string; name: string; nodes: CategoryNode[] }
type Vendor = { id: string; name: string }

type ApplyMode = 'base_only' | 'base_and_overrides' | 'overrides_only'
type ChangeType = 'percent' | 'fixed' | 'set'
type PriceField = BulkPriceFieldTarget
type BulkSelectionMode = 'all' | 'selected'

type LoadedProduct = BulkPricingProductRow & {
    sku: string | null
    category: string | null
    node: string | null
    category_id: string | null
    category_node_id: string | null
}

type SaveResult = {
    products_affected: number
    base_updated: number
    overrides_upserted: number
    batch_id: string | null
}

const APPLY_MODE_INFO: Record<ApplyMode, { label: string; desc: string; color: string }> = {
    base_only: {
        label: 'Base Only (Default)',
        desc: 'Updates base product prices. Existing vendor overrides remain unchanged.',
        color: 'bg-blue-50 border-blue-200 text-blue-800'
    },
    base_and_overrides: {
        label: 'Base + Sync Overrides',
        desc: 'Updates base prices and synchronizes targeted vendor overrides with the saved sell prices.',
        color: 'bg-amber-50 border-amber-200 text-amber-800'
    },
    overrides_only: {
        label: 'Override Vendors Only',
        desc: 'Keeps the existing direct bulk override workflow for vendor-specific pricing.',
        color: 'bg-purple-50 border-purple-200 text-purple-800'
    }
}

const FIELD_OPTIONS: { value: PriceField; label: string }[] = [
    { value: 'SELL_UNIT', label: 'Sell Price (per unit)' },
    { value: 'SELL_CASE', label: 'Sell Price (per case)' },
    { value: 'COST', label: 'Cost Price' },
    { value: 'COST_UNIT', label: 'Cost Price (per unit)' },
    { value: 'COST_CASE', label: 'Cost Price (per case)' }
]

const EDITABLE_FIELDS: BulkEditablePriceField[] = [
    'sell_per_unit',
    'sell_per_case',
    'cost_per_unit',
    'cost_per_case'
]

const EDITABLE_FIELD_LABELS: Record<BulkEditablePriceField, string> = {
    sell_per_unit: 'Sell / Unit',
    sell_per_case: 'Sell / Case',
    cost_per_unit: 'Cost / Unit',
    cost_per_case: 'Cost / Case'
}

function toCanonicalFieldTarget(field: PriceField): CanonicalBulkPriceFieldTarget {
    return field === 'COST' ? 'COST_UNIT' : field
}

function formatPriceInputValue(value: number | null): string {
    if (value === null) return ''
    return value.toFixed(4).replace(/\.?0+$/, '')
}

function formatPriceCaption(value: number | null): string {
    return value === null ? '—' : formatMoney(value)
}

function formatDeltaCaption(value: number | null) {
    if (value === null) return '—'
    const rounded = Math.round(value * 100) / 100
    const prefix = rounded > 0 ? '+' : ''
    return `${prefix}${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toFixed(2)}`
}

function computePreviewValue(currentValue: number | null, changeType: ChangeType, rawValue: string) {
    if (currentValue === null) return null
    const parsedValue = Number(rawValue)
    if (!Number.isFinite(parsedValue)) return currentValue

    if (changeType === 'percent') {
        return Math.round(currentValue * (1 + parsedValue / 100) * 10000) / 10000
    }
    if (changeType === 'fixed') {
        return Math.round((currentValue + parsedValue) * 10000) / 10000
    }
    return Math.round(parsedValue * 10000) / 10000
}

function getRowInputValue(row: ResolvedBulkPricingRow<LoadedProduct>, overrides: BulkPricingRowOverrides, field: BulkEditablePriceField) {
    const overrideValue = overrides[row.id]?.[field]
    if (overrideValue !== undefined) {
        return String(overrideValue)
    }

    return formatPriceInputValue(row.final[field])
}

function describeInvalidProducts(names: string[]) {
    if (names.length === 0) return ''
    const preview = names.slice(0, 3).join(', ')
    if (names.length <= 3) return preview
    return `${preview} +${names.length - 3} more`
}

export function BulkPricingClient({
    categoryTree,
    vendors,
    distributorId
}: {
    categoryTree: Category[]
    vendors: Vendor[]
    distributorId: string
}) {
    const router = useRouter()

    const [selectedCategoryId, setSelectedCategoryId] = useState('')
    const [selectedNodeId, setSelectedNodeId] = useState('')
    const [selectedSubNodeId, setSelectedSubNodeId] = useState('')

    const [field, setField] = useState<PriceField>('SELL_UNIT')
    const [changeType, setChangeType] = useState<ChangeType>('percent')
    const [value, setValue] = useState('')
    const [bulkSelectionMode, setBulkSelectionMode] = useState<BulkSelectionMode>('all')

    const [applyMode, setApplyMode] = useState<ApplyMode>('base_only')
    const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([])

    const [loadedProducts, setLoadedProducts] = useState<LoadedProduct[]>([])
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
    const [bulkRule, setBulkRule] = useState<BulkPricingRule | null>(null)
    const [rowOverrides, setRowOverrides] = useState<BulkPricingRowOverrides>({})

    const [searchTerm, setSearchTerm] = useState('')
    const deferredSearchTerm = useDeferredValue(searchTerm)

    const [isLoadingProducts, setIsLoadingProducts] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isExecutingLegacy, setIsExecutingLegacy] = useState(false)
    const [result, setResult] = useState<SaveResult | null>(null)

    const selectedCategory = categoryTree.find((category) => category.id === selectedCategoryId)
    const rootNodes = selectedCategory?.nodes || []
    const selectedNode = rootNodes.find((node) => node.id === selectedNodeId)
    const subNodes = selectedNode?.children || []

    const effectiveScopeType = selectedSubNodeId ? 'category_node' : selectedNodeId ? 'category_node' : 'category'
    const effectiveScopeId = selectedSubNodeId || selectedNodeId || selectedCategoryId
    const scopeLabel = selectedSubNodeId
        ? subNodes.find((node) => node.id === selectedSubNodeId)?.name || ''
        : selectedNodeId
            ? selectedNode?.name || ''
            : selectedCategory?.name || ''

    const showVendorSection = applyMode !== 'base_only'
    const canonicalField = toCanonicalFieldTarget(field)
    const priceUnit: PriceUnit = getPriceUnitForBulkTarget(canonicalField)

    const selectedProductIdSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds])

    const resolvedRows = useMemo(() => resolveBulkPricingRows({
        rows: loadedProducts,
        bulkRule,
        rowOverrides
    }), [loadedProducts, bulkRule, rowOverrides])

    const filteredRows = useMemo(() => {
        if (!deferredSearchTerm.trim()) return resolvedRows
        const lowered = deferredSearchTerm.toLowerCase()
        return resolvedRows.filter((row) =>
            row.name.toLowerCase().includes(lowered)
            || (row.sku && row.sku.toLowerCase().includes(lowered))
            || (row.category && row.category.toLowerCase().includes(lowered))
            || (row.node && row.node.toLowerCase().includes(lowered))
        )
    }, [resolvedRows, deferredSearchTerm])

    const filteredRowIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows])
    const filteredSelectionCount = filteredRows.filter((row) => selectedProductIdSet.has(row.id)).length
    const allFilteredSelected = filteredRows.length > 0 && filteredSelectionCount === filteredRows.length

    const saveRows = useMemo(() => buildBulkPricingSaveRows(resolvedRows), [resolvedRows])
    const rowsWithErrors = resolvedRows.filter((row) => Object.keys(row.fieldErrors).length > 0)
    const customOverrideCount = resolvedRows.filter((row) => row.hasOverride).length
    const bulkOnlyCount = resolvedRows.filter((row) => row.hasBulkChanges && !row.hasOverride).length
    const changedCount = saveRows.length

    const legacyPreviewRows = useMemo(() => loadedProducts.slice(0, 50), [loadedProducts])
    const isBulkValueValid = parseNumericInput(value, 'Value', {
        allowNegative: changeType !== 'set',
        roundTo: 4
    }).ok
    const canSave = loadedProducts.length > 0 && changedCount > 0 && rowsWithErrors.length === 0 && !isSaving && applyMode !== 'overrides_only'

    const resetLoadedState = () => {
        setLoadedProducts([])
        setSelectedProductIds([])
        setBulkRule(null)
        setRowOverrides({})
        setSearchTerm('')
        setResult(null)
    }

    const handleCategoryChange = (categoryId: string) => {
        setSelectedCategoryId(categoryId)
        setSelectedNodeId('')
        setSelectedSubNodeId('')
        resetLoadedState()
    }

    const handleNodeChange = (nodeId: string) => {
        setSelectedNodeId(nodeId)
        setSelectedSubNodeId('')
        resetLoadedState()
    }

    const handleSubNodeChange = (nodeId: string) => {
        setSelectedSubNodeId(nodeId)
        resetLoadedState()
    }

    const loadScopeProducts = async (options?: { preserveResult?: boolean; silent?: boolean }) => {
        if (!effectiveScopeId) {
            toast.error('Please select a scope to load.')
            return
        }

        setIsLoadingProducts(true)
        if (!options?.preserveResult) {
            setResult(null)
        }

        const response = await fetchScopeProducts(effectiveScopeType as 'category' | 'category_node', effectiveScopeId)
        if (!response.ok) {
            toast.error(response.error || 'Failed to load products.')
            setIsLoadingProducts(false)
            return
        }

        setLoadedProducts(response.products || [])
        setSelectedProductIds([])
        setBulkRule(null)
        setRowOverrides({})
        setSearchTerm('')
        if (!options?.silent) {
            toast.success(`Loaded ${response.products.length} product${response.products.length === 1 ? '' : 's'}.`)
        }
        setIsLoadingProducts(false)
    }

    const handleApplyBulkRule = () => {
        if (!loadedProducts.length) {
            toast.error('Load products before applying a bulk rule.')
            return
        }

        const parsedValue = parseNumericInput(value, 'Value', {
            allowNegative: changeType !== 'set',
            roundTo: 4
        })
        if (!parsedValue.ok) {
            toast.error(parsedValue.error)
            return
        }

        const productIds = bulkSelectionMode === 'selected'
            ? selectedProductIds
            : loadedProducts.map((row) => row.id)

        const nextRule: BulkPricingRule = {
            field: canonicalField,
            changeType,
            value: parsedValue.value,
            productIds
        }

        const validation = validateBulkPricingRule(loadedProducts, nextRule)
        if (!validation.ok) {
            const detail = describeInvalidProducts(validation.invalidProductNames)
            toast.error(detail ? `${validation.error}: ${detail}` : validation.error)
            return
        }

        setBulkRule(nextRule)
        setResult(null)
        toast.success(`Bulk rule applied to ${productIds.length} product${productIds.length === 1 ? '' : 's'}.`)
    }

    const handleClearBulkRule = () => {
        setBulkRule(null)
        setResult(null)
    }

    const handleToggleVendor = (vendorId: string) => {
        setSelectedVendorIds((current) =>
            current.includes(vendorId)
                ? current.filter((id) => id !== vendorId)
                : [...current, vendorId]
        )
    }

    const handleToggleRowSelection = (productId: string) => {
        setSelectedProductIds((current) =>
            current.includes(productId)
                ? current.filter((id) => id !== productId)
                : [...current, productId]
        )
    }

    const handleToggleFilteredSelection = () => {
        setSelectedProductIds((current) => {
            const next = new Set(current)
            if (allFilteredSelected) {
                filteredRowIds.forEach((id) => next.delete(id))
            } else {
                filteredRowIds.forEach((id) => next.add(id))
            }
            return Array.from(next)
        })
    }

    const setOverrideValue = (productId: string, fieldKey: BulkEditablePriceField, nextValue: string) => {
        setRowOverrides((current) => {
            const nextRow = {
                ...(current[productId] || {}),
                [fieldKey]: nextValue
            }

            if (nextValue === '') {
                delete nextRow[fieldKey]
            }

            const hasValues = Object.keys(nextRow).length > 0
            if (!hasValues) {
                const { [productId]: _removed, ...rest } = current
                return rest
            }

            return {
                ...current,
                [productId]: nextRow
            }
        })
        setResult(null)
    }

    const normalizeOverrideValue = (productId: string, fieldKey: BulkEditablePriceField) => {
        const currentValue = rowOverrides[productId]?.[fieldKey]
        if (currentValue === undefined || currentValue === '') return

        const parsed = parseNumericInput(currentValue, EDITABLE_FIELD_LABELS[fieldKey], {
            allowNegative: false,
            roundTo: 4
        })
        if (!parsed.ok) return

        setOverrideValue(productId, fieldKey, formatPriceInputValue(parsed.value))
    }

    const handleResetRowOverride = (productId: string) => {
        setRowOverrides((current) => {
            const { [productId]: _removed, ...rest } = current
            return rest
        })
        setResult(null)
    }

    const handleResetAllOverrides = () => {
        setRowOverrides({})
        setResult(null)
    }

    const handleSave = async () => {
        if (!canSave || !effectiveScopeId) return

        const confirmation = window.confirm(
            `Save pricing changes for ${changedCount} product${changedCount === 1 ? '' : 's'} in ${scopeLabel || 'the selected scope'}?`
        )
        if (!confirmation) return

        setIsSaving(true)
        setResult(null)

        const response = await saveResolvedBulkPricingRows({
            distributorId,
            scope: {
                type: effectiveScopeType as 'category' | 'category_node',
                id: effectiveScopeId
            },
            applyMode,
            vendorIds: showVendorSection && selectedVendorIds.length > 0 ? selectedVendorIds : null,
            rows: saveRows
        })

        if (!response.ok) {
            toast.error(response.error || 'Failed to save bulk pricing changes.')
            setIsSaving(false)
            return
        }

        if (!response.data) {
            toast.error('Bulk pricing save completed without a result payload.')
            setIsSaving(false)
            return
        }

        const saveData = response.data
        await loadScopeProducts({ preserveResult: true, silent: true })
        setResult(saveData)
        toast.success(`Saved ${saveData.products_affected} product${saveData.products_affected === 1 ? '' : 's'}.`)
        router.refresh()
        setIsSaving(false)
    }

    const handleExecuteLegacy = async () => {
        if (!effectiveScopeId) {
            toast.error('Please select a scope.')
            return
        }

        const parsedValue = parseNumericInput(value, 'Value', {
            allowNegative: changeType !== 'set',
            roundTo: 4
        })
        if (!parsedValue.ok) {
            toast.error(parsedValue.error)
            return
        }

        const confirmation = window.confirm(
            `Execute the vendor override bulk adjustment for ${loadedProducts.length || 'the loaded'} product${loadedProducts.length === 1 ? '' : 's'} in ${scopeLabel || 'the selected scope'}?`
        )
        if (!confirmation) return

        setIsExecutingLegacy(true)
        setResult(null)

        const response = await executeBulkPriceAdjustment({
            distributorId,
            scope: {
                type: effectiveScopeType as 'category' | 'category_node',
                id: effectiveScopeId
            },
            applyMode,
            vendorIds: selectedVendorIds.length > 0 ? selectedVendorIds : null,
            changeType,
            value: parsedValue.value,
            fieldTarget: field,
            priceUnit
        })

        if (!response.ok) {
            toast.error(response.error || 'Failed to execute bulk adjustment.')
            setIsExecutingLegacy(false)
            return
        }

        if (!response.data) {
            toast.error('Bulk adjustment completed without a result payload.')
            setIsExecutingLegacy(false)
            return
        }

        const legacyData = response.data
        setResult(legacyData)
        toast.success(`Updated ${legacyData.products_affected} product${legacyData.products_affected === 1 ? '' : 's'}.`)
        router.refresh()
        setIsExecutingLegacy(false)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">1. Select Scope</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Category</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={selectedCategoryId}
                                onChange={(event) => handleCategoryChange(event.target.value)}
                            >
                                <option value="">-- Select Category --</option>
                                {categoryTree.map((category) => (
                                    <option key={category.id} value={category.id}>{category.name}</option>
                                ))}
                            </select>
                        </div>

                        {rootNodes.length > 0 && (
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Subcategory <span className="text-slate-400 font-normal">(optional)</span></label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={selectedNodeId}
                                    onChange={(event) => handleNodeChange(event.target.value)}
                                >
                                    <option value="">All in category</option>
                                    {rootNodes.map((node) => (
                                        <option key={node.id} value={node.id}>{node.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {subNodes.length > 0 && (
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Sub-subcategory <span className="text-slate-400 font-normal">(optional)</span></label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={selectedSubNodeId}
                                    onChange={(event) => handleSubNodeChange(event.target.value)}
                                >
                                    <option value="">All in subcategory</option>
                                    {subNodes.map((node) => (
                                        <option key={node.id} value={node.id}>{node.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button variant="outline" size="sm" onClick={() => void loadScopeProducts()} disabled={!selectedCategoryId || isLoadingProducts}>
                            {isLoadingProducts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                            Load Products
                        </Button>
                        {loadedProducts.length > 0 && (
                            <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm">
                                <strong>{loadedProducts.length}</strong> product(s) loaded in <strong>{scopeLabel}</strong>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">2. Bulk Rule</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Price Field</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field}
                                onChange={(event) => {
                                    setField(event.target.value as PriceField)
                                    setResult(null)
                                }}
                            >
                                {FIELD_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Change Type</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={changeType}
                                onChange={(event) => {
                                    setChangeType(event.target.value as ChangeType)
                                    setResult(null)
                                }}
                            >
                                <option value="percent">Percentage (%)</option>
                                <option value="fixed">Fixed Amount ($)</option>
                                <option value="set">Set Exact Price ($)</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">
                                Value {changeType === 'percent' ? '(e.g. 10 or -5)' : '(e.g. 1.50)'}
                            </label>
                            <Input
                                type="number"
                                step="0.0001"
                                value={value}
                                onChange={(event) => {
                                    setValue(event.target.value)
                                    setResult(null)
                                }}
                                placeholder={changeType === 'percent' ? '10' : '1.50'}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                            <button
                                type="button"
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                                    bulkSelectionMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                                )}
                                onClick={() => setBulkSelectionMode('all')}
                            >
                                All loaded
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                                    bulkSelectionMode === 'selected' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                                )}
                                onClick={() => setBulkSelectionMode('selected')}
                            >
                                Selected rows
                            </button>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleApplyBulkRule} disabled={!loadedProducts.length}>
                            Apply Bulk Rule
                        </Button>
                        {bulkRule && (
                            <Button variant="ghost" size="sm" onClick={handleClearBulkRule}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Clear Bulk Rule
                            </Button>
                        )}
                        {bulkRule && (
                            <div className="text-sm text-slate-500">
                                Active on <strong>{bulkRule.productIds.length}</strong> product(s)
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">3. Apply Mode</h3>

                    <div className="grid gap-3">
                        {(Object.entries(APPLY_MODE_INFO) as [ApplyMode, typeof APPLY_MODE_INFO[ApplyMode]][]).map(([mode, info]) => (
                            <label
                                key={mode}
                                className={cn(
                                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                                    applyMode === mode ? `${info.color} ring-2 ring-offset-1` : 'bg-white border-slate-200 hover:border-slate-300'
                                )}
                            >
                                <input
                                    type="radio"
                                    name="applyMode"
                                    value={mode}
                                    checked={applyMode === mode}
                                    onChange={() => setApplyMode(mode)}
                                    className="mt-1"
                                />
                                <div>
                                    <div className="font-medium text-sm">{info.label}</div>
                                    <div className="text-xs mt-0.5 opacity-80">{info.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {showVendorSection && (
                <Card>
                    <CardContent className="p-5 space-y-4">
                        <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">4. Target Vendors</h3>

                        {vendors.length === 0 ? (
                            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                No vendors connected. Link vendors in onboarding first.
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 text-sm">
                                    <Button
                                        variant={selectedVendorIds.length === 0 ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedVendorIds([])}
                                    >
                                        All Vendors ({vendors.length})
                                    </Button>
                                    <span className="text-slate-400">or select specific:</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                    {vendors.map((vendor) => (
                                        <label
                                            key={vendor.id}
                                            className={cn(
                                                'flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm transition-all',
                                                selectedVendorIds.includes(vendor.id)
                                                    ? 'bg-indigo-50 border-indigo-300'
                                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedVendorIds.includes(vendor.id)}
                                                onChange={() => handleToggleVendor(vendor.id)}
                                                className="rounded"
                                            />
                                            <span className="truncate">{vendor.name}</span>
                                        </label>
                                    ))}
                                </div>
                                {selectedVendorIds.length > 0 && (
                                    <div className="text-xs text-slate-500">
                                        {selectedVendorIds.length} vendor(s) selected
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {loadedProducts.length > 0 && applyMode !== 'overrides_only' && (
                <Card>
                    <CardContent className="p-5 space-y-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">5. Review Final Prices</h3>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <Badge variant="outline">{loadedProducts.length} loaded</Badge>
                                    <Badge variant="secondary">{bulkOnlyCount} bulk only</Badge>
                                    <Badge variant="warning">{customOverrideCount} custom overrides</Badge>
                                    <Badge variant="success">{changedCount} row(s) to save</Badge>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="relative min-w-[220px]">
                                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(event) => setSearchTerm(event.target.value)}
                                        placeholder="Search loaded products..."
                                        className="pl-9"
                                    />
                                </div>
                                <Button variant="outline" size="sm" onClick={handleToggleFilteredSelection} disabled={filteredRows.length === 0}>
                                    {allFilteredSelected ? 'Clear filtered selection' : 'Select filtered'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleResetAllOverrides} disabled={customOverrideCount === 0}>
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Reset all overrides
                                </Button>
                            </div>
                        </div>

                        {rowsWithErrors.length > 0 && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                Resolve {rowsWithErrors.length} row validation issue{rowsWithErrors.length === 1 ? '' : 's'} before saving.
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-3 py-3 text-left">
                                            <input
                                                type="checkbox"
                                                checked={allFilteredSelected}
                                                onChange={handleToggleFilteredSelection}
                                                aria-label="Select filtered rows"
                                            />
                                        </th>
                                        <th className="px-3 py-3 text-left font-medium text-slate-600">Product</th>
                                        {EDITABLE_FIELDS.map((fieldKey) => (
                                            <th key={fieldKey} className="px-3 py-3 text-left font-medium text-slate-600 min-w-[180px]">
                                                {EDITABLE_FIELD_LABELS[fieldKey]}
                                            </th>
                                        ))}
                                        <th className="px-3 py-3 text-left font-medium text-slate-600">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredRows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className={cn(
                                                'align-top',
                                                row.hasOverride && 'bg-amber-50/50',
                                                !row.hasOverride && row.hasBulkChanges && 'bg-blue-50/35'
                                            )}
                                        >
                                            <td className="px-3 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedProductIdSet.has(row.id)}
                                                    onChange={() => handleToggleRowSelection(row.id)}
                                                    aria-label={`Select ${row.name}`}
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="space-y-1">
                                                    <div className="font-medium text-slate-900">{row.name}</div>
                                                    <div className="text-xs text-slate-500">
                                                        {[row.sku, row.category, row.node].filter(Boolean).join(' · ') || 'No additional metadata'}
                                                    </div>
                                                </div>
                                            </td>

                                            {EDITABLE_FIELDS.map((fieldKey) => {
                                                const fieldError = row.fieldErrors[fieldKey]
                                                const inputValue = getRowInputValue(row, rowOverrides, fieldKey)
                                                const isCaseField = fieldKey === 'sell_per_case' || fieldKey === 'cost_per_case'
                                                const isDisabled = isCaseField && !row.allow_case

                                                return (
                                                    <td key={fieldKey} className="px-3 py-3">
                                                        <div className="space-y-1.5">
                                                            <Input
                                                                type="number"
                                                                step="0.0001"
                                                                disabled={isDisabled}
                                                                value={inputValue}
                                                                onChange={(event) => setOverrideValue(row.id, fieldKey, event.target.value)}
                                                                onBlur={() => normalizeOverrideValue(row.id, fieldKey)}
                                                                className={cn(fieldError && 'border-red-300 focus-visible:border-red-400 focus-visible:ring-red-200')}
                                                            />
                                                            <div className="space-y-0.5 text-[11px] leading-4">
                                                                <div className="text-slate-500">Original {formatPriceCaption(row.base[fieldKey])}</div>
                                                                {row.bulkPreview[fieldKey] !== undefined && (
                                                                    <div className="text-blue-600">Bulk {formatPriceCaption(row.bulkPreview[fieldKey] ?? null)}</div>
                                                                )}
                                                                {row.sources[fieldKey] === 'override' && (
                                                                    <div className="text-amber-700">Custom final {formatPriceCaption(row.final[fieldKey])}</div>
                                                                )}
                                                                {isDisabled && (
                                                                    <div className="text-slate-400">Case pricing unavailable</div>
                                                                )}
                                                                {fieldError && (
                                                                    <div className="text-red-600">{fieldError}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                )
                                            })}

                                            <td className="px-3 py-3">
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap gap-2">
                                                        {row.hasOverride ? (
                                                            <Badge variant="warning">Custom Override</Badge>
                                                        ) : row.hasBulkChanges ? (
                                                            <Badge variant="secondary">Bulk Applied</Badge>
                                                        ) : (
                                                            <Badge variant="outline">Original</Badge>
                                                        )}
                                                        {row.changedFields.length > 0 && (
                                                            <Badge variant="success">{row.changedFields.length} field(s) changed</Badge>
                                                        )}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleResetRowOverride(row.id)}
                                                        disabled={!row.hasOverride}
                                                    >
                                                        <RotateCcw className="mr-2 h-4 w-4" />
                                                        Reset override
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                    {filteredRows.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                                                No loaded products match the current search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                            <div>
                                {selectedProductIds.length} selected row(s) · {filteredRows.length} visible row(s)
                            </div>
                            <div>
                                Final preview shows the exact values that will be saved for each row.
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {loadedProducts.length > 0 && applyMode === 'overrides_only' && (
                <Card className="border-purple-200 bg-purple-50/60">
                    <CardContent className="p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-purple-700 mt-0.5" />
                            <div className="space-y-1 text-sm text-purple-800">
                                <div className="font-semibold">Override-only mode keeps the existing direct workflow.</div>
                                <div>
                                    Load the scope, review the first {legacyPreviewRows.length} products below, and execute the vendor override adjustment as before.
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-purple-200 bg-white">
                            <table className="min-w-full text-sm">
                                <thead className="bg-purple-50 border-b border-purple-100">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-slate-600">Product</th>
                                        <th className="px-3 py-2 text-right font-medium text-slate-600">Current</th>
                                        <th className="px-3 py-2 text-right font-medium text-slate-600">New</th>
                                        <th className="px-3 py-2 text-right font-medium text-slate-600">Δ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-purple-50">
                                    {legacyPreviewRows.map((row) => {
                                        const currentValue = canonicalField === 'SELL_UNIT'
                                            ? row.sell_per_unit
                                            : canonicalField === 'SELL_CASE'
                                                ? row.sell_per_case
                                            : canonicalField === 'COST_CASE'
                                                    ? row.cost_per_case
                                                    : row.cost_per_unit
                                        const nextValue = computePreviewValue(currentValue, changeType, value)
                                        const delta = nextValue === null || currentValue === null
                                            ? null
                                            : nextValue - currentValue

                                        return (
                                            <tr key={row.id}>
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-slate-900">{row.name}</div>
                                                    <div className="text-xs text-slate-500">
                                                        {[row.sku, row.category, row.node].filter(Boolean).join(' · ')}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-600">{formatPriceCaption(currentValue)}</td>
                                                <td className="px-3 py-2 text-right text-slate-700">{formatPriceCaption(nextValue)}</td>
                                                <td className="px-3 py-2 text-right text-slate-500">{formatDeltaCaption(delta)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end">
                            <Button size="lg" onClick={handleExecuteLegacy} disabled={isExecutingLegacy || !loadedProducts.length || !isBulkValueValid}>
                                {isExecutingLegacy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Execute Bulk Adjustment
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {result && (
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4 flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-green-800">
                            <div className="font-semibold">Bulk pricing update complete</div>
                            <div className="mt-1">
                                Products affected: <strong>{result.products_affected}</strong> ·
                                Base updated: <strong>{result.base_updated}</strong> ·
                                Overrides upserted: <strong>{result.overrides_upserted}</strong>
                            </div>
                            {result.batch_id && (
                                <div className="mt-1 text-xs text-green-600 font-mono">
                                    Batch: {result.batch_id.slice(0, 8)}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {applyMode !== 'overrides_only' && (
                <div className="flex justify-end gap-3">
                    <Button size="lg" disabled={!canSave} onClick={handleSave} className="px-8">
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Final Prices
                    </Button>
                </div>
            )}
        </div>
    )
}
