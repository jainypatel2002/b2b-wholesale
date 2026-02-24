'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ShoppingCart, ArrowLeft, Star, X } from 'lucide-react'
import { ProductCard } from '@/components/vendor/product-card'
import { toast } from 'sonner'
import { usePathname, useSearchParams } from 'next/navigation'

interface CategoryProductsClientProps {
    products: any[]
    categoryName: string
    subcategories: any[]
    distributorId: string
    favoritesOnly: boolean
    initialFavoriteProductIds: string[]
}

export function CategoryProductsClient({
    products,
    categoryName,
    subcategories,
    distributorId,
    favoritesOnly,
    initialFavoriteProductIds
}: CategoryProductsClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
    const [inStockOnly, setInStockOnly] = useState(false)
    const [sortOrder, setSortOrder] = useState<string>('name_asc')
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(initialFavoriteProductIds))
    const [pendingFavorites, setPendingFavorites] = useState<Set<string>>(() => new Set())
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const favoritesHref = useMemo(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('favorites', '1')
        const qs = params.toString()
        return qs ? `${pathname}?${qs}` : pathname
    }, [pathname, searchParams])

    const allProductsHref = useMemo(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('favorites')
        const qs = params.toString()
        return qs ? `${pathname}?${qs}` : pathname
    }, [pathname, searchParams])

    async function toggleFavorite(productId: string) {
        if (!productId || pendingFavorites.has(productId)) return

        const optimisticWasFavorite = favoriteIds.has(productId)
        const optimisticNext = new Set(favoriteIds)
        if (optimisticWasFavorite) optimisticNext.delete(productId)
        else optimisticNext.add(productId)

        setFavoriteIds(optimisticNext)
        setPendingFavorites((prev) => new Set(prev).add(productId))

        try {
            const res = await fetch('/api/vendor/favorites', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ product_id: productId })
            })

            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to update favorite')
            }

            const confirmedIsFavorite = !!json?.favorited
            setFavoriteIds((prev) => {
                const next = new Set(prev)
                if (confirmedIsFavorite) next.add(productId)
                else next.delete(productId)
                return next
            })
        } catch (error: any) {
            setFavoriteIds((prev) => {
                const next = new Set(prev)
                if (optimisticWasFavorite) next.add(productId)
                else next.delete(productId)
                return next
            })
            toast.error(error?.message || 'Could not update favorite')
        } finally {
            setPendingFavorites((prev) => {
                const next = new Set(prev)
                next.delete(productId)
                return next
            })
        }
    }

    const filteredProducts = useMemo(() => {
        let result = products

        if (favoritesOnly) {
            result = result.filter((p: any) => favoriteIds.has(p.id))
        }

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
    }, [products, favoritesOnly, favoriteIds, searchTerm, selectedSubcategory, inStockOnly, sortOrder])

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
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        <Link href={allProductsHref}>
                            <Button variant={favoritesOnly ? 'outline' : 'secondary'} size="sm" className="w-full sm:w-auto">
                                All Products
                            </Button>
                        </Link>
                        <Link href={favoritesHref}>
                            <Button variant={favoritesOnly ? 'secondary' : 'outline'} size="sm" className="w-full sm:w-auto">
                                <Star className="mr-2 h-4 w-4" />
                                Favorites
                            </Button>
                        </Link>
                    </div>
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
                                className="form-select h-9 w-full"
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
                            className="form-select h-9 w-full"
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
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
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
                    {favoritesOnly && <span className="ml-2 text-amber-700">Favorites only</span>}
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-12 text-center">
                    <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No products match your filters.</p>
                    <Button
                        variant="link"
                        onClick={() => {
                            setSearchTerm('')
                            setSelectedSubcategory('all')
                            setInStockOnly(false)
                        }}
                        className="mt-2"
                    >
                        Clear all filters
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.map((p) => (
                        <ProductCard
                            key={p.id}
                            product={p}
                            distributorId={distributorId}
                            isFavorite={favoriteIds.has(p.id)}
                            favoriteBusy={pendingFavorites.has(p.id)}
                            onToggleFavorite={toggleFavorite}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
