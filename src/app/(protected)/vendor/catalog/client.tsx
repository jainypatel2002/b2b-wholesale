'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { SearchInput } from '@/components/search-input'

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
        alert('Added to cart')
    }

    return (
        <div className="space-y-4">
            <div className="card p-4">
                <SearchInput onSearch={setSearchTerm} placeholder="Search products..." />
            </div>

            <div className="card p-6">
                <h2 className="text-lg font-medium">Products</h2>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-slate-500">
                            <tr>
                                <th className="py-2">Name</th>
                                <th>Category</th>
                                <th>Price</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length ? (
                                filteredProducts.map((p) => (
                                    <tr key={p.id} className="border-t border-slate-200">
                                        <td className="py-2 font-medium">{p.name}</td>
                                        <td>{p.categories?.name ?? '-'}</td>
                                        <td>{Number(p.sell_price).toFixed(2)}</td>
                                        <td className="text-right">
                                            <button className="btn" onClick={() => addToCart(p)}>Add</button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td className="py-3 text-slate-600" colSpan={4}>No products found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4">
                    <Link className="btn" href="/vendor/cart">Go to cart</Link>
                </div>
            </div>
        </div>
    )
}
