'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { executeBulkPriceAdjustment, fetchScopeProductCount, fetchSampleProducts } from './actions'

type CategoryNode = { id: string; name: string; category_id: string; children: CategoryNode[] }
type Category = { id: string; name: string; nodes: CategoryNode[] }
type Vendor = { id: string; name: string }

type ApplyMode = 'base_only' | 'base_and_overrides' | 'overrides_only'
type ChangeType = 'percent' | 'fixed' | 'set'
type PriceField = 'sell_price' | 'price_case' | 'cost_price'

const APPLY_MODE_INFO: Record<ApplyMode, { label: string; desc: string; color: string }> = {
    base_only: {
        label: 'Base Only (Default)',
        desc: 'Updates base product prices. Existing vendor overrides remain unchanged.',
        color: 'bg-blue-50 border-blue-200 text-blue-800'
    },
    base_and_overrides: {
        label: 'Base + Sync Overrides',
        desc: 'Updates base prices AND synchronizes vendor overrides to match the new price.',
        color: 'bg-amber-50 border-amber-200 text-amber-800'
    },
    overrides_only: {
        label: 'Override Vendors Only',
        desc: 'Base prices stay the same. Only creates/updates override prices for targeted vendors.',
        color: 'bg-purple-50 border-purple-200 text-purple-800'
    }
}

const FIELD_LABELS: Record<PriceField, string> = {
    sell_price: 'Sell Price (per unit)',
    price_case: 'Sell Price (per case)',
    cost_price: 'Cost Price'
}

export function BulkPricingClient({ categoryTree, vendors }: { categoryTree: Category[]; vendors: Vendor[] }) {
    const router = useRouter()
    // Scope
    const [selectedCategoryId, setSelectedCategoryId] = useState('')
    const [selectedNodeId, setSelectedNodeId] = useState('')
    const [selectedSubNodeId, setSelectedSubNodeId] = useState('')

    // Price adjustment
    const [field, setField] = useState<PriceField>('sell_price')
    const [changeType, setChangeType] = useState<ChangeType>('percent')
    const [value, setValue] = useState('')

    // Apply mode
    const [applyMode, setApplyMode] = useState<ApplyMode>('base_only')

    // Vendor targeting
    const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([])

    // Preview
    const [previewCount, setPreviewCount] = useState<number | null>(null)
    const [sampleProducts, setSampleProducts] = useState<any[]>([])
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)
    const [isExecuting, setIsExecuting] = useState(false)
    const [result, setResult] = useState<any>(null)

    // Confirm dialog
    const confirmRef = useRef<HTMLDialogElement>(null)

    // Derived: current category nodes
    const selectedCategory = categoryTree.find(c => c.id === selectedCategoryId)
    const rootNodes = selectedCategory?.nodes || []
    const selectedNode = rootNodes.find(n => n.id === selectedNodeId)
    const subNodes = selectedNode?.children || []

    // Computed scope
    const effectiveScopeType = selectedSubNodeId ? 'category_node' : selectedNodeId ? 'category_node' : 'category'
    const effectiveScopeId = selectedSubNodeId || selectedNodeId || selectedCategoryId
    const scopeLabel = selectedSubNodeId
        ? subNodes.find(n => n.id === selectedSubNodeId)?.name || ''
        : selectedNodeId
            ? selectedNode?.name || ''
            : selectedCategory?.name || ''

    const showVendorSection = applyMode !== 'base_only'

    const handleCategoryChange = (catId: string) => {
        setSelectedCategoryId(catId)
        setSelectedNodeId('')
        setSelectedSubNodeId('')
        setPreviewCount(null)
        setSampleProducts([])
        setResult(null)
    }

    const handleNodeChange = (nodeId: string) => {
        setSelectedNodeId(nodeId)
        setSelectedSubNodeId('')
        setPreviewCount(null)
        setSampleProducts([])
        setResult(null)
    }

    const handleSubNodeChange = (nodeId: string) => {
        setSelectedSubNodeId(nodeId)
        setPreviewCount(null)
        setSampleProducts([])
        setResult(null)
    }

    const handleLoadPreview = useCallback(async () => {
        if (!effectiveScopeId) return
        setIsLoadingPreview(true)
        setResult(null)
        try {
            const [countRes, sampleRes] = await Promise.all([
                fetchScopeProductCount(effectiveScopeType as any, effectiveScopeId),
                fetchSampleProducts(effectiveScopeType as any, effectiveScopeId)
            ])
            setPreviewCount(countRes.count)
            setSampleProducts(sampleRes.products || [])
        } catch {
            toast.error('Failed to load preview')
        } finally {
            setIsLoadingPreview(false)
        }
    }, [effectiveScopeType, effectiveScopeId])

    const handleExecute = async () => {
        confirmRef.current?.close()

        const numValue = parseFloat(value)
        if (isNaN(numValue)) {
            toast.error('Please enter a valid number')
            return
        }

        setIsExecuting(true)
        setResult(null)

        const vendorIds = showVendorSection
            ? (selectedVendorIds.length > 0 ? selectedVendorIds : null)
            : null

        const res = await executeBulkPriceAdjustment({
            scopeType: effectiveScopeType as any,
            scopeId: effectiveScopeId,
            applyMode,
            vendorIds,
            changeType,
            value: numValue,
            field
        })

        if (res.ok) {
            setResult(res.data)
            toast.success(`Updated ${res.data.products_affected} products`)
            // Bust Next.js client-side router cache so inventory page shows fresh prices
            router.refresh()
            // Refresh preview
            handleLoadPreview()
        } else {
            toast.error(res.error || 'Failed to execute')
        }
        setIsExecuting(false)
    }

    const canExecute = effectiveScopeId && value.trim() && !isNaN(parseFloat(value))

    // Compute preview prices
    const computeNewPrice = (oldPrice: number) => {
        const v = parseFloat(value)
        if (isNaN(v)) return oldPrice
        if (changeType === 'percent') return Math.round(oldPrice * (1 + v / 100) * 100) / 100
        if (changeType === 'fixed') return Math.round((oldPrice + v) * 100) / 100
        if (changeType === 'set') return Math.round(v * 100) / 100
        return oldPrice
    }

    const toggleVendor = (vendorId: string) => {
        setSelectedVendorIds(prev =>
            prev.includes(vendorId) ? prev.filter(id => id !== vendorId) : [...prev, vendorId]
        )
    }

    return (
        <div className="space-y-6">
            {/* Step 1: Scope Selection */}
            <Card>
                <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">1. Select Scope</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Category</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={selectedCategoryId}
                                onChange={e => handleCategoryChange(e.target.value)}
                            >
                                <option value="">-- Select Category --</option>
                                {categoryTree.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {rootNodes.length > 0 && (
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Subcategory <span className="text-slate-400 font-normal">(optional)</span></label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={selectedNodeId}
                                    onChange={e => handleNodeChange(e.target.value)}
                                >
                                    <option value="">All in category</option>
                                    {rootNodes.map(n => (
                                        <option key={n.id} value={n.id}>{n.name}</option>
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
                                    onChange={e => handleSubNodeChange(e.target.value)}
                                >
                                    <option value="">All in subcategory</option>
                                    {subNodes.map(n => (
                                        <option key={n.id} value={n.id}>{n.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {selectedCategoryId && (
                        <Button variant="outline" size="sm" onClick={handleLoadPreview} disabled={isLoadingPreview}>
                            {isLoadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                            Load Preview
                        </Button>
                    )}

                    {previewCount !== null && (
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm">
                            <strong>{previewCount}</strong> product(s) in scope: <strong>{scopeLabel}</strong>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Step 2: Adjustment Parameters */}
            <Card>
                <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">2. Adjustment Parameters</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Price Field</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={field}
                                onChange={e => setField(e.target.value as PriceField)}
                            >
                                {Object.entries(FIELD_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Change Type</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={changeType}
                                onChange={e => setChangeType(e.target.value as ChangeType)}
                            >
                                <option value="percent">Percentage (%)</option>
                                <option value="fixed">Fixed Amount ($)</option>
                                <option value="set">Set Exact Price ($)</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">
                                Value {changeType === 'percent' ? '(e.g. 10 for +10%, -5 for -5%)' : '(e.g. 1.50 for $1.50)'}
                            </label>
                            <Input
                                type="number"
                                step="0.01"
                                value={value}
                                onChange={e => { setValue(e.target.value); setResult(null) }}
                                placeholder={changeType === 'percent' ? '10' : '1.50'}
                            />
                        </div>
                    </div>

                    {/* Price Preview Table */}
                    {sampleProducts.length > 0 && value.trim() && !isNaN(parseFloat(value)) && (
                        <div className="border rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-slate-600">Product</th>
                                        <th className="px-3 py-2 text-right font-medium text-slate-600">Current</th>
                                        <th className="px-3 py-2 text-right font-medium text-slate-600">New</th>
                                        <th className="px-3 py-2 text-right font-medium text-slate-600">Δ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {sampleProducts.map(p => {
                                        const currentPrice = Number(p[field] || 0)
                                        const newPrice = computeNewPrice(currentPrice)
                                        const diff = newPrice - currentPrice
                                        return (
                                            <tr key={p.id} className={`hover:bg-slate-50 ${newPrice < 0 ? 'bg-red-50' : ''}`}>
                                                <td className="px-3 py-2 font-medium">{p.name}</td>
                                                <td className="px-3 py-2 text-right text-slate-500">${currentPrice.toFixed(2)}</td>
                                                <td className={`px-3 py-2 text-right font-semibold ${newPrice < 0 ? 'text-red-600' : ''}`}>
                                                    ${Math.max(0, newPrice).toFixed(2)}
                                                    {newPrice < 0 && <span className="ml-1 text-[10px] text-red-500">(floored to $0)</span>}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            <div className="px-3 py-1.5 bg-slate-50 border-t text-xs text-slate-400">
                                Showing up to 50 products
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Step 3: Apply Mode */}
            <Card>
                <CardContent className="p-5 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-700 uppercase tracking-wider">3. Apply Mode</h3>

                    <div className="grid gap-3">
                        {(Object.entries(APPLY_MODE_INFO) as [ApplyMode, typeof APPLY_MODE_INFO[ApplyMode]][]).map(([mode, info]) => (
                            <label
                                key={mode}
                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${applyMode === mode ? info.color + ' ring-2 ring-offset-1' : 'bg-white border-slate-200 hover:border-slate-300'}`}
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

            {/* Step 4: Vendor Targeting (only when mode includes overrides) */}
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
                                    {vendors.map(v => (
                                        <label
                                            key={v.id}
                                            className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm transition-all ${selectedVendorIds.includes(v.id) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedVendorIds.includes(v.id)}
                                                onChange={() => toggleVendor(v.id)}
                                                className="rounded"
                                            />
                                            <span className="truncate">{v.name}</span>
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

            {/* Result Summary */}
            {result && (
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4 flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-green-800">
                            <div className="font-semibold">Bulk adjustment complete</div>
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

            {/* Execute Button */}
            <div className="flex justify-end gap-3">
                <Button
                    size="lg"
                    disabled={!canExecute || isExecuting}
                    onClick={() => confirmRef.current?.showModal()}
                    className="px-8"
                >
                    {isExecuting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Execute Bulk Adjustment
                </Button>
            </div>

            {/* Confirmation Dialog */}
            <dialog ref={confirmRef} className="rounded-xl p-0 backdrop:bg-slate-900/50 shadow-xl border-0 m-auto">
                <div className="w-full max-w-md bg-white p-6 space-y-4">
                    <div className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5" />
                        <h3 className="text-lg font-semibold">Confirm Bulk Adjustment</h3>
                    </div>

                    <div className="text-sm text-slate-600 space-y-2">
                        <p><strong>Scope:</strong> {scopeLabel || 'Not selected'}</p>
                        <p><strong>Field:</strong> {FIELD_LABELS[field]}</p>
                        <p><strong>Change:</strong> {changeType === 'percent' ? `${value}%` : changeType === 'set' ? `Set to $${value}` : `$${value}`}</p>
                        <p><strong>Mode:</strong> {APPLY_MODE_INFO[applyMode].label}</p>
                        {showVendorSection && (
                            <p><strong>Vendors:</strong> {selectedVendorIds.length > 0 ? `${selectedVendorIds.length} selected` : `All (${vendors.length})`}</p>
                        )}
                        {previewCount !== null && (
                            <p><strong>Products affected:</strong> ~{previewCount}</p>
                        )}
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                        This action will permanently modify prices. This cannot be undone.
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t">
                        <Button variant="ghost" onClick={() => confirmRef.current?.close()}>Cancel</Button>
                        <Button variant="destructive" onClick={handleExecute} disabled={isExecuting}>
                            {isExecuting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm & Execute
                        </Button>
                    </div>
                </div>
            </dialog>
        </div>
    )
}
