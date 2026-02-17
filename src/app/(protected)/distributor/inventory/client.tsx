'use client'

import React, { useState, useMemo, useRef } from 'react'
import { SearchInput } from '@/components/search-input'
import { updateProduct } from '@/app/actions/distributor'

interface Category {
    id: string
    name: string
}

interface Product {
    id: string
    name: string
    sku: string | null
    cost_price: number | null
    sell_price: number | null
    stock_qty: number
    category_id: string | null
    categories?: { name: string } | null
}

interface InventoryClientProps {
    initialProducts: Product[]
    categories: Category[]
    addProductAction: (formData: FormData) => Promise<void>
}

function ProductTable({ products, onEdit }: { products: Product[], onEdit: (p: Product) => void }) {
    if (!products.length) return <p className="text-sm text-slate-500 italic py-2">No matching products.</p>

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-left text-slate-500 bg-slate-50">
                    <tr>
                        <th className="py-2 pl-2">Name</th>
                        <th>SKU</th>
                        <th>Cost</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.id} className="border-t border-slate-100">
                            <td className="py-2 pl-2 font-medium">{p.name}</td>
                            <td className="font-mono text-xs">{p.sku ?? '-'}</td>
                            <td>{Number(p.cost_price).toFixed(2)}</td>
                            <td>{Number(p.sell_price).toFixed(2)}</td>
                            <td>{p.stock_qty}</td>
                            <td>
                                <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={() => onEdit(p)}>Edit</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export function InventoryClient({ initialProducts, categories, addProductAction }: InventoryClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const modalRef = useRef<HTMLDialogElement>(null)

    // Filter products based on search term
    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return initialProducts

        const lowerTerm = searchTerm.toLowerCase()
        return initialProducts.filter(p =>
            p.name.toLowerCase().includes(lowerTerm) ||
            (p.sku && p.sku.toLowerCase().includes(lowerTerm)) ||
            (p.categories?.name && p.categories.name.toLowerCase().includes(lowerTerm))
        )
    }, [initialProducts, searchTerm])

    // Group filtered products
    const { grouped, uncategorized } = useMemo(() => {
        const g = new Map<string, Product[]>()
        categories.forEach(c => g.set(c.id, []))
        const uncat: Product[] = []

        filteredProducts.forEach(p => {
            if (p.category_id && g.has(p.category_id)) {
                g.get(p.category_id)?.push(p)
            } else {
                uncat.push(p)
            }
        })

        return { grouped: g, uncategorized: uncat }
    }, [filteredProducts, categories])

    const handleEdit = (p: Product) => {
        setEditingProduct(p)
        modalRef.current?.showModal()
    }

    const closeEdit = () => {
        setEditingProduct(null)
        modalRef.current?.close()
    }

    return (
        <div className="space-y-6">

            {/* Search Bar - explicitly add border to ensure visibility */}
            <div className="card p-4 border border-slate-200 shadow-sm">
                <SearchInput onSearch={setSearchTerm} placeholder="Search by name, SKU, or category..." />
            </div>

            {/* Add Product Form */}
            <div className="card p-6">
                <h2 className="text-lg font-medium mb-4">Add Product</h2>
                <form action={addProductAction} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 items-end bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="text-xs font-medium text-slate-600">Name</label>
                        <input name="name" className="input mt-1 w-full" placeholder="Product Name" required />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Category</label>
                        <select name="category_id" className="input mt-1 w-full">
                            <option value="">Uncategorized</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">SKU</label>
                        <input name="sku" className="input mt-1 w-full" placeholder="Optional" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Cost</label>
                        <input name="cost_price" className="input mt-1 w-full" type="number" step="0.01" defaultValue={0} />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Price</label>
                        <input name="sell_price" className="input mt-1 w-full" type="number" step="0.01" defaultValue={0} />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600">Stock</label>
                        <input name="stock_qty" className="input mt-1 w-full" type="number" step="1" defaultValue={0} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-3 mt-2">
                        <button className="btn w-full md:w-auto" type="submit">Add Product</button>
                    </div>
                </form>
            </div>

            {/* Product List */}
            <div className="space-y-6">
                {categories.map(c => {
                    const items = grouped.get(c.id) || []
                    if (searchTerm && items.length === 0) return null

                    return (
                        <div key={c.id} className="card overflow-hidden">
                            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                <h3 className="font-semibold text-slate-800">{c.name}</h3>
                                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{items.length} items</span>
                            </div>
                            <div className="p-0">
                                <ProductTable products={items} onEdit={handleEdit} />
                            </div>
                        </div>
                    )
                })}

                {(uncategorized.length > 0 || (!searchTerm && uncategorized.length === 0)) && (
                    <div className="card overflow-hidden border-l-4 border-l-orange-400">
                        {uncategorized.length > 0 && (
                            <>
                                <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex justify-between items-center">
                                    <h3 className="font-semibold text-orange-900">Uncategorized</h3>
                                    <span className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded-full">{uncategorized.length} items</span>
                                </div>
                                <div className="p-0">
                                    <ProductTable products={uncategorized} onEdit={handleEdit} />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {filteredProducts.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                        No products found matching &quot;{searchTerm}&quot;.
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            <dialog ref={modalRef} className="modal">
                <div className="modal-box w-11/12 max-w-3xl">
                    <h3 className="font-bold text-lg mb-4">Edit Product</h3>
                    {editingProduct && (
                        <form action={async (formData) => {
                            await updateProduct(formData)
                            closeEdit()
                        }}>
                            <input type="hidden" name="id" value={editingProduct.id} />
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="md:col-span-2">
                                    <label className="label-text">Name</label>
                                    <input name="name" className="input w-full mt-1" defaultValue={editingProduct.name} required />
                                </div>
                                <div>
                                    <label className="label-text">Category</label>
                                    <select name="category_id" className="input w-full mt-1" defaultValue={editingProduct.category_id || ''}>
                                        <option value="">Uncategorized</option>
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label-text">SKU</label>
                                    <input name="sku" className="input w-full mt-1" defaultValue={editingProduct.sku || ''} />
                                </div>
                                <div>
                                    <label className="label-text">Cost Price</label>
                                    <input name="cost_price" className="input w-full mt-1" type="number" step="0.01" defaultValue={editingProduct.cost_price || 0} />
                                </div>
                                <div>
                                    <label className="label-text">Sell Price</label>
                                    <input name="sell_price" className="input w-full mt-1" type="number" step="0.01" defaultValue={editingProduct.sell_price || 0} />
                                </div>
                                <div>
                                    <label className="label-text">Stock</label>
                                    <input name="stock_qty" className="input w-full mt-1" type="number" step="1" defaultValue={editingProduct.stock_qty} />
                                </div>
                            </div>
                            <div className="modal-action">
                                <button type="button" className="btn" onClick={closeEdit}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Changes</button>
                            </div>
                        </form>
                    )}
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button onClick={closeEdit}>close</button>
                </form>
            </dialog>
        </div>
    )
}
