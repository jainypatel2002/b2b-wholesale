'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Loader2, RotateCcw, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { fetchOverrides, saveOverride, removeOverride } from './actions'

type Vendor = { id: string, name: string }
type Product = {
    id: string
    name: string
    sku: string | null
    base_unit_price: number | null
    base_case_price: number | null
    allow_case: boolean
    allow_piece: boolean
    units_per_case: number | null
    stock_pieces: number
    category_id: string | null
    category_node_id: string | null
    category?: string
    node?: string
}

type OverrideRow = {
    price_per_unit: number | null
    price_per_case: number | null
}

export function VendorPricingClient({ vendors, products }: { vendors: Vendor[], products: Product[] }) {
    const [selectedVendorId, setSelectedVendorId] = useState<string>('')
    const [searchTerm, setSearchTerm] = useState('')

    // Overrides state: map of productId -> canonical unit/case override pair
    const [overrides, setOverrides] = useState<Map<string, OverrideRow>>(new Map())
    const [isLoadingOverrides, setIsLoadingOverrides] = useState(false)

    useEffect(() => {
        if (!selectedVendorId) {
            setOverrides(new Map())
            return
        }

        const loadOverrides = async () => {
            setIsLoadingOverrides(true)
            try {
                const data = await fetchOverrides(selectedVendorId)
                const newMap = new Map<string, OverrideRow>()
                data.forEach((o: any) => {
                    const unit = Number.isFinite(Number(o.price_per_unit))
                        ? Number(o.price_per_unit)
                        : null
                    const casePrice = Number.isFinite(Number(o.price_per_case))
                        ? Number(o.price_per_case)
                        : null
                    if (unit !== null || casePrice !== null) {
                        newMap.set(o.product_id, {
                            price_per_unit: unit,
                            price_per_case: casePrice
                        })
                    }
                })
                setOverrides(newMap)
            } catch (e) {
                toast.error("Failed to load vendor overrides")
            } finally {
                setIsLoadingOverrides(false)
            }
        }
        loadOverrides()
    }, [selectedVendorId])

    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return products
        const lower = searchTerm.toLowerCase()
        return products.filter(p =>
            p.name.toLowerCase().includes(lower) ||
            (p.sku && p.sku.toLowerCase().includes(lower)) ||
            (p.category && p.category.toLowerCase().includes(lower)) ||
            (p.node && p.node.toLowerCase().includes(lower))
        )
    }, [products, searchTerm])

    // Bulk pricing is now handled by the dedicated /distributor/bulk-pricing page

    return (
        <div className="space-y-6">
            {/* Vendor Selector & Tools */}
            <Card>
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <label className="font-medium text-sm whitespace-nowrap">Select Vendor:</label>
                        <select
                            className="flex h-10 w-full sm:w-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={selectedVendorId}
                            onChange={e => setSelectedVendorId(e.target.value)}
                        >
                            <option value="">-- Choose a vendor --</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                </CardContent>
            </Card>

            {selectedVendorId ? (
                <div className="space-y-4">
                    <div className="flex gap-4 mb-4 flex-wrap items-center justify-between">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search products..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <a href="/distributor/bulk-pricing">
                            <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                                <TrendingUp className="mr-2 h-4 w-4" /> Bulk Price Tool
                            </Button>
                        </a>
                    </div>

                    {isLoadingOverrides ? (
                        <div className="flex justify-center p-12 bg-white rounded-xl border border-slate-200">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <Card className="overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 border-b font-medium">
                                        <tr>
                                            <th className="px-4 py-3">Product Name</th>
                                            <th className="px-4 py-3">SKU</th>
                                            <th className="px-4 py-3">Base Price</th>
                                            <th className="px-4 py-3">Vendor Override ($)</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredProducts.map(p => (
                                            <ProductRow
                                                key={p.id}
                                                product={p}
                                                vendorId={selectedVendorId}
                                                override={overrides.get(p.id)}
                                                onOverrideChange={(next: OverrideRow | null) => {
                                                    const newMap = new Map(overrides)
                                                    if (next) {
                                                        newMap.set(p.id, next)
                                                    } else {
                                                        newMap.delete(p.id)
                                                    }
                                                    setOverrides(newMap)
                                                }}
                                            />
                                        ))}
                                        {filteredProducts.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center text-slate-500">No products found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}
                </div>
            ) : (
                <div className="text-center p-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-500 mb-4">Please select a vendor to manage their specific pricing overrides.</p>
                    <a href="/distributor/bulk-pricing">
                        <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <TrendingUp className="mr-2 h-4 w-4" /> Open Bulk Price Tool Instead
                        </Button>
                    </a>
                </div>
            )}


        </div>
    )
}

function ProductRow({
    product,
    vendorId,
    override,
    onOverrideChange
}: {
    product: Product
    vendorId: string
    override?: OverrideRow
    onOverrideChange: (next: OverrideRow | null) => void
}) {
    const targetUnit: 'unit' | 'case' = product.allow_case ? 'case' : 'unit'
    const unitsPerCase = Math.max(1, Math.floor(Number(product.units_per_case || 1)))
    const baseUnitPrice = product.base_unit_price
    const baseCasePrice = product.base_case_price ?? (baseUnitPrice == null ? null : baseUnitPrice * unitsPerCase)

    const savedValue = targetUnit === 'case'
        ? (override?.price_per_case ?? override?.price_per_unit ?? null)
        : (override?.price_per_unit ?? null)

    const [inputValue, setInputValue] = useState<string>(
        savedValue == null ? '' : Number(savedValue).toFixed(2)
    )
    const [isSaving, setIsSaving] = useState(false)
    const isOverridden = savedValue != null

    useEffect(() => {
        setInputValue(savedValue == null ? '' : Number(savedValue).toFixed(2))
    }, [savedValue])

    const handleSave = async () => {
        if (!inputValue.trim()) {
            return handleRemove()
        }

        const priceDollars = parseFloat(inputValue)
        if (isNaN(priceDollars) || priceDollars < 0) {
            toast.error("Invalid price")
            return
        }

        setIsSaving(true)
        const res = await saveOverride(vendorId, product.id, priceDollars, targetUnit)
        if (res.ok) {
            toast.success("Saved override")
            onOverrideChange({
                price_per_unit: targetUnit === 'unit' ? priceDollars : null,
                price_per_case: targetUnit === 'case' ? priceDollars : (override?.price_per_case ?? null)
            })
        } else {
            toast.error(res.error)
        }
        setIsSaving(false)
    }

    const handleRemove = async () => {
        setIsSaving(true)
        const res = await removeOverride(vendorId, product.id)
        if (res.ok) {
            toast.success("Removed override")
            setInputValue('')
            onOverrideChange(null)
        } else {
            toast.error(res.error)
        }
        setIsSaving(false)
    }

    const savedDollarValue = savedValue == null ? '' : Number(savedValue).toFixed(2)
    const isDirty = inputValue !== savedDollarValue
    const basePrice = targetUnit === 'case' ? baseCasePrice : baseUnitPrice

    return (
        <tr className={`hover:bg-slate-50 transition-colors ${isOverridden ? 'bg-blue-50/30' : ''}`}>
            <td className="px-4 py-3 font-medium">
                <div className="flex flex-col">
                    {product.name}
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                        {[product.category, product.node].filter(Boolean).join(' > ')}
                    </span>
                </div>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.sku || '-'}</td>
            <td className="px-4 py-3 text-slate-600">
                ${Number(basePrice ?? 0).toFixed(2)}
                <span className="ml-2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                    {targetUnit}
                </span>
            </td>
            <td className="px-4 py-3">
                <div className="relative max-w-[120px]">
                    <span className="absolute left-3 top-2 text-slate-500">$</span>
                    <Input
                        type="number"
                        step="0.01"
                        className={`h-9 pl-7 pr-2 ${isOverridden ? 'border-blue-300 bg-blue-50/50 outline-blue-500' : ''}`}
                        placeholder={Number(basePrice ?? 0).toFixed(2)}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleSave()
                        }}
                    />
                </div>
            </td>
            <td className="px-4 py-3 text-right space-x-2 w-[140px]">
                {isDirty && (
                    <Button size="sm" variant="default" onClick={handleSave} disabled={isSaving} className="h-8">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                )}
                {isOverridden && !isDirty && (
                    <Button size="sm" variant="ghost" onClick={handleRemove} disabled={isSaving} className="h-8 text-slate-400 hover:text-red-500" title="Remove custom pricing">
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                )}
            </td>
        </tr>
    )
}
