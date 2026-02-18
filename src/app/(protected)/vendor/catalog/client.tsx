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

    function addToCart(p: any) {
        const key = 'dv_cart'
        const raw = localStorage.getItem(key)
        const cart = raw ? JSON.parse(raw) : { items: [] as any[] }
        const existing = cart.items.find((i: any) => i.product_id === p.id)
        if (existing) existing.qty += 1
        else cart.items.push({ product_id: p.id, name: p.name, unit_price: p.sell_price, qty: 1 })
        localStorage.setItem(key, JSON.stringify(cart))

        // Simple visual feedback could be improved with a toast
        alert(`Added ${p.name} to cart`)
    }

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
                        <Card key={p.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
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
                                <p className="text-xs text-slate-500">per unit</p>
                            </CardContent>
                            <CardFooter className="p-4 pt-0">
                                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => addToCart(p)}>
                                    <Plus className="mr-2 h-4 w-4" /> Add to Cart
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
