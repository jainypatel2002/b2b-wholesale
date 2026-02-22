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
    base_price: number
    stock_pieces: number
    category_id: string | null
    category_node_id: string | null
    category?: string
    node?: string
}

export function VendorPricingClient({ vendors, products }: { vendors: Vendor[], products: Product[] }) {
    const [selectedVendorId, setSelectedVendorId] = useState<string>('')
    const [searchTerm, setSearchTerm] = useState('')

    // Overrides state: map of productId -> price_cents
    const [overrides, setOverrides] = useState<Map<string, number>>(new Map())
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
                const newMap = new Map<string, number>()
                data.forEach((o: any) => newMap.set(o.product_id, o.price_cents))
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
                                                initialOverrideCents={overrides.get(p.id)}
                                                onOverrideRemoved={() => {
                                                    const newMap = new Map(overrides)
                                                    newMap.delete(p.id)
                                                    setOverrides(newMap)
                                                }}
                                                onOverrideSaved={(cents: number) => {
                                                    const newMap = new Map(overrides)
                                                    newMap.set(p.id, cents)
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

function ProductRow({ product, vendorId, initialOverrideCents, onOverrideRemoved, onOverrideSaved }: any) {
    // Override is stored in UI state as Dollars for easy editing
    const [inputValue, setInputValue] = useState<string>(
        initialOverrideCents !== undefined ? (initialOverrideCents / 100).toFixed(2) : ''
    )
    const [isSaving, setIsSaving] = useState(false)
    const isOverridden = initialOverrideCents !== undefined

    // Sync state if vendor changes
    useEffect(() => {
        setInputValue(initialOverrideCents !== undefined ? (initialOverrideCents / 100).toFixed(2) : '')
    }, [initialOverrideCents])

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
        const res = await saveOverride(vendorId, product.id, priceDollars)
        if (res.ok) {
            toast.success("Saved override")
            onOverrideSaved(Math.round(priceDollars * 100))
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
            onOverrideRemoved()
        } else {
            toast.error(res.error)
        }
        setIsSaving(false)
    }

    const savedDollarValue = initialOverrideCents !== undefined ? (initialOverrideCents / 100).toFixed(2) : ''
    const isDirty = inputValue !== savedDollarValue

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
            <td className="px-4 py-3 text-slate-600">${Number(product.base_price).toFixed(2)}</td>
            <td className="px-4 py-3">
                <div className="relative max-w-[120px]">
                    <span className="absolute left-3 top-2 text-slate-500">$</span>
                    <Input
                        type="number"
                        step="0.01"
                        className={`h-9 pl-7 pr-2 ${isOverridden ? 'border-blue-300 bg-blue-50/50 outline-blue-500' : ''}`}
                        placeholder={Number(product.base_price).toFixed(2)}
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
