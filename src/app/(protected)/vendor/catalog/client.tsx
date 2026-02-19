'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, ShoppingCart, Plus, X } from 'lucide-react'

export function CatalogClient({ products, allCategories }: { products: any[], allCategories: any[] }) {
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
    const [inStockOnly, setInStockOnly] = useState(false)
    const [sortOrder, setSortOrder] = useState<string>('name_asc')

    // Get subcategories for selected category
    const availableSubcategories = useMemo(() => {
        if (selectedCategory === 'all') return []
        const cat = allCategories.find(c => c.name === selectedCategory)
        return cat?.subcategories || []
    }, [selectedCategory, allCategories])

    // Reset subcategory when category changes
    // We can't do this easily in render, so we'll do it in the onChange handler

    const filteredProducts = useMemo(() => {
        let result = products

        // 1. Search
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase()
            result = result.filter(p =>
                p.name.toLowerCase().includes(lower) ||
                p.categories?.name?.toLowerCase().includes(lower) ||
                p.subcategories?.name?.toLowerCase().includes(lower) ||
                (p.sku && p.sku.toLowerCase().includes(lower))
            )
        }

        // 2. Category
        if (selectedCategory !== 'all') {
            result = result.filter(p => p.categories?.name === selectedCategory)
        }

        // 3. Subcategory
        if (selectedCategory !== 'all' && selectedSubcategory !== 'all') {
            // Accessing joined subcategory name or ID. 
            // The query is `subcategories(name)`. `p.subcategories` is object or array?
            // Supabase returns object for M:1. 
            // We can match by name since we used name in dropdown, or ID if we used ID.
            // Let's use name to be consistent with category dropdown.
            result = result.filter(p => p.subcategories?.name === selectedSubcategory)
        }

        // 4. In Stock
        if (inStockOnly) {
            result = result.filter(p => (p.stock_pieces > 0 || p.stock_qty > 0))
        }

        // 5. Sort
        result = [...result].sort((a, b) => {
            switch (sortOrder) {
                case 'price_asc':
                    return Number(a.sell_price) - Number(b.sell_price)
                case 'price_desc':
                    return Number(b.sell_price) - Number(a.sell_price)
                case 'name_asc':
                default:
                    return a.name.localeCompare(b.name)
            }
        })

        return result
    }, [products, searchTerm, selectedCategory, selectedSubcategory, inStockOnly, sortOrder])

    const handleCategoryChange = (val: string) => {
        setSelectedCategory(val)
        setSelectedSubcategory('all')
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                {/* Top Row: Search & Cart */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            type="search"
                            placeholder="Search by name, SKU, category..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Link href="/vendor/cart">
                        <Button variant="outline" className="w-full sm:w-auto relative">
                            <ShoppingCart className="mr-2 h-4 w-4" /> Go to Cart
                        </Button>
                    </Link>
                </div>

                {/* Filter Row */}
                <div className="flex flex-col sm:flex-row gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100 items-start sm:items-center flex-wrap">

                    {/* Category Filter */}
                    <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[150px]">
                        <label className="text-xs font-medium text-slate-500">Category</label>
                        <select
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={selectedCategory}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                        >
                            <option value="all">All Categories</option>
                            {allCategories.map((c: any) => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Subcategory Filter (Dependent) */}
                    {selectedCategory !== 'all' && availableSubcategories.length > 0 && (
                        <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[150px]">
                            <label className="text-xs font-medium text-slate-500">Subcategory</label>
                            <select
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={selectedSubcategory}
                                onChange={(e) => setSelectedSubcategory(e.target.value)}
                            >
                                <option value="all">All Subcategories</option>
                                {availableSubcategories.map((sc: any) => (
                                    <option key={sc.id} value={sc.name}>{sc.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Sort Order */}
                    <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[150px]">
                        <label className="text-xs font-medium text-slate-500">Sort By</label>
                        <select
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                        >
                            <option value="name_asc">Name (A-Z)</option>
                            <option value="price_asc">Price (Low to High)</option>
                            <option value="price_desc">Price (High to Low)</option>
                        </select>
                    </div>

                    {/* In Stock Toggle */}
                    <div className="flex items-center gap-2 mt-auto pb-2 sm:pb-0">
                        <input
                            type="checkbox"
                            id="stock-toggle"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            checked={inStockOnly}
                            onChange={(e) => setInStockOnly(e.target.checked)}
                        />
                        <label htmlFor="stock-toggle" className="text-sm font-medium text-slate-700 cursor-pointer">
                            In Stock Only
                        </label>
                    </div>

                    {/* Reset Button (Only visible if filters active) */}
                    {(searchTerm || selectedCategory !== 'all' || inStockOnly) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchTerm('')
                                handleCategoryChange('all')
                                setInStockOnly(false)
                                setSortOrder('name_asc')
                            }}
                            className="mt-auto ml-auto text-slate-500 hover:text-slate-900"
                        >
                            <X className="mr-2 h-3 w-3" /> Clear Filters
                        </Button>
                    )}
                </div>

                {/* Results Count */}
                <div className="text-xs text-slate-500 font-medium px-1">
                    Showing {filteredProducts.length} of {products.length} products
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No products match your filters.</p>
                    <Button
                        variant="link"
                        onClick={() => {
                            setSearchTerm('')
                            handleCategoryChange('all')
                            setInStockOnly(false)
                        }}
                        className="mt-2 text-blue-600"
                    >
                        Clear all filters
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.map((p) => (
                        <ProductCard key={p.id} product={p} />
                    ))}
                </div>
            )}
        </div>
    )
}

function ProductCard({ product: p }: { product: any }) {
    // Determine default unit: Piece if allowed, else Case
    const [unit, setUnit] = useState<'piece' | 'case'>(p.allow_piece ? 'piece' : 'case')

    // Only show toggle if both are allowed
    const showToggle = p.allow_piece && p.allow_case

    function addToCart() {
        const key = 'dv_cart'
        const raw = localStorage.getItem(key)
        const cart = raw ? JSON.parse(raw) : { items: [] as any[] }

        // Check for existing item with SAME product_id AND SAME unit
        // If we want to allow mixed units for same product, we need composed ID or separate checks.
        // For simplicity, let's treat them as separate lines if possible, OR merge them?
        // The cart logic in `page.tsx` (Step 31) uses `product_id` as key. `find(i => i.product_id === p.id)`.
        // This means we CANNOT easily have both "Case" and "Piece" of same product in cart with current logic unless we change ID schema in cart.
        // Let's modify cart structure slightly: product_id is mostly used. 
        // If I implement full multi-unit support, I should filter by `product_id` AND `order_unit`.
        // But the previous cart page implementation (Step 31) uses `product_id` to identify.
        // I will update Cart Validation/Page later. For now, let's treat (product_id + unit) as unique?
        // Or just append unit to ID? No, that breaks backend.
        // I will check if item exists with same unit. 

        const existingIdx = cart.items.findIndex((i: any) => i.product_id === p.id && i.order_unit === unit)

        if (existingIdx >= 0) {
            cart.items[existingIdx].qty += 1
        } else {
            cart.items.push({
                product_id: p.id,
                name: p.name,
                unit_price: p.sell_price,
                qty: 1,
                order_unit: unit,
                units_per_case: p.units_per_case
            })
        }

        localStorage.setItem(key, JSON.stringify(cart))
        // Simple visual feedback
        const unitLabel = unit === 'case' ? 'Case' : 'Unit'
        alert(`Added ${p.name} (${unitLabel}) to cart`)
    }

    return (
        <Card className="flex flex-col h-full hover:shadow-md transition-shadow">
            <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start gap-2">
                    <Badge variant="secondary" className="mb-2">
                        {p.categories?.name ?? 'Uncategorized'}
                    </Badge>
                </div>
                <CardTitle className="text-base font-semibold line-clamp-2" title={p.name}>
                    {p.name}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-grow">
                <div className="mt-2 text-2xl font-bold text-slate-900">
                    ${Number(p.sell_price).toFixed(2)}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                    {unit === 'case' ? `per case (${p.units_per_case} units)` : 'per unit'}
                </p>

                {showToggle && (
                    <div className="flex rounded-md shadow-sm" role="group">
                        <button
                            type="button"
                            onClick={() => setUnit('piece')}
                            className={`px-3 py-1 text-xs font-medium border rounded-l-lg ${unit === 'piece'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            Piece
                        </button>
                        <button
                            type="button"
                            onClick={() => setUnit('case')}
                            className={`px-3 py-1 text-xs font-medium border-t border-b border-r rounded-r-lg ${unit === 'case'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            Case
                        </button>
                    </div>
                )}

                {!showToggle && (
                    <Badge variant="outline" className="font-normal">
                        {unit === 'case' ? `Case Only (${p.units_per_case} count)` : 'Piece Only'}
                    </Badge>
                )}
            </CardContent>
            <CardFooter className="p-4 pt-0">
                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={addToCart}>
                    <Plus className="mr-2 h-4 w-4" /> Add {unit === 'case' ? 'Case' : 'Item'}
                </Button>
            </CardFooter>
        </Card>
    )
}
