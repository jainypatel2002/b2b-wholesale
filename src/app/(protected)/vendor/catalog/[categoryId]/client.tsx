'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ShoppingCart, ArrowLeft, X } from 'lucide-react'
import { ProductCard } from '@/components/vendor/product-card'

interface CategoryProductsClientProps {
    products: any[]
    categoryName: string
    subcategories: any[]
    distributorId: string
}

export function CategoryProductsClient({ products, categoryName, subcategories, distributorId }: CategoryProductsClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
    const [inStockOnly, setInStockOnly] = useState(false)
    const [sortOrder, setSortOrder] = useState<string>('name_asc')

    const filteredProducts = useMemo(() => {
        let result = products

        // 1. Search
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase()
            result = result.filter(p =>
                p.name.toLowerCase().includes(lower) ||
                p.subcategories?.name?.toLowerCase().includes(lower) ||
                (p.sku && p.sku.toLowerCase().includes(lower))
            )
        }

        // 2. Subcategory
        if (selectedSubcategory !== 'all') {
            result = result.filter(p => p.subcategories?.name === selectedSubcategory)
        }

        // 3. In Stock
        if (inStockOnly) {
            result = result.filter(p => (p.stock_pieces > 0 || p.stock_qty > 0))
        }

        // 4. Sort
        result = [...result].sort((a, b) => {
            switch (sortOrder) {
                case 'price_asc':
                    return (a.sell_per_unit || 0) - (b.sell_per_unit || 0)
                case 'price_desc':
                    return (b.sell_per_unit || 0) - (a.sell_per_unit || 0)
                case 'name_asc':
                default:
                    return a.name.localeCompare(b.name)
            }
        })

        return result
    }, [products, searchTerm, selectedSubcategory, inStockOnly, sortOrder])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{categoryName}</h1>
                    <p className="text-sm text-slate-500">Browse products in this category</p>
                </div>
                <Link href="/vendor/catalog">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Categories
                    </Button>
                </Link>
            </div>

            <div className="flex flex-col gap-4">
                {/* Top Row: Search & Cart */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            type="search"
                            placeholder="Search in this category..."
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

                    {/* Subcategory Filter */}
                    {subcategories.length > 0 && (
                        <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[150px]">
                            <label className="text-xs font-medium text-slate-500">Subcategory</label>
                            <select
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={selectedSubcategory}
                                onChange={(e) => setSelectedSubcategory(e.target.value)}
                            >
                                <option value="all">All Subcategories</option>
                                {subcategories.map((sc: any) => (
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

                    {/* Reset Button */}
                    {(searchTerm || selectedSubcategory !== 'all' || inStockOnly) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchTerm('')
                                setSelectedSubcategory('all')
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
                            setSelectedSubcategory('all')
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
                        <ProductCard key={p.id} product={p} distributorId={distributorId} />
                    ))}
                </div>
            )}
        </div>
    )
}
