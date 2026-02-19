'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, ShoppingCart, Plus } from 'lucide-react'

export function CatalogClient({ products }: { products: any[] }) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return products
        const lower = searchTerm.toLowerCase()
        return products.filter(p =>
            p.name.toLowerCase().includes(lower) ||
            p.categories?.name?.toLowerCase().includes(lower)
        )
    }, [products, searchTerm])

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                        type="search"
                        placeholder="Search products..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Link href="/vendor/cart">
                    <Button variant="outline" className="w-full sm:w-auto">
                        <ShoppingCart className="mr-2 h-4 w-4" /> Go to Cart
                    </Button>
                </Link>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-slate-500">No products found.</p>
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
