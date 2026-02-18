'use client'

import React, { useState, useMemo, useRef } from 'react'
import { Search, Plus, Edit, Package } from 'lucide-react'
import { updateProduct } from '@/app/actions/distributor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

export function InventoryClient({ initialProducts, categories, addProductAction }: InventoryClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const modalRef = useRef<HTMLDialogElement>(null)
    const addModalRef = useRef<HTMLDialogElement>(null)

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
    const groupedData = useMemo(() => {
        const groups = new Map<string, Product[]>()
        const uncat: Product[] = []

        filteredProducts.forEach(p => {
            if (p.category_id) {
                if (!groups.has(p.category_id)) {
                    groups.set(p.category_id, [])
                }
                groups.get(p.category_id)?.push(p)
            } else {
                uncat.push(p)
            }
        })

        return { groups, uncat }
    }, [filteredProducts])

    // Helper to get category name
    const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Unknown Category'

    const handleEdit = (p: Product) => {
        setEditingProduct(p)
        modalRef.current?.showModal()
    }

    const openAddModal = () => {
        addModalRef.current?.showModal()
    }

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Search products, SKUs, categories..."
                        className="pl-9 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button onClick={openAddModal}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                </Button>
            </div>

            {/* Product Lists by Category */}
            {Array.from(groupedData.groups.entries()).map(([catId, products]) => (
                <Card key={catId}>
                    <CardHeader className="py-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Package className="h-5 w-5 text-slate-500" />
                            {getCategoryName(catId)}
                            <Badge variant="secondary" className="ml-2">{products.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ProductList products={products} onEdit={handleEdit} />
                    </CardContent>
                </Card>
            ))}

            {groupedData.uncat.length > 0 && (
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Package className="h-5 w-5 text-slate-500" />
                            Uncategorized
                            <Badge variant="secondary" className="ml-2">{groupedData.uncat.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ProductList products={groupedData.uncat} onEdit={handleEdit} />
                    </CardContent>
                </Card>
            )}

            {filteredProducts.length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
                    <p className="text-slate-500">No products found matching your search.</p>
                </div>
            )}

            {/* Edit Modal */}
            <dialog ref={modalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="flex items-center justify-between border-b p-4">
                            <h3 className="font-semibold text-lg">Edit Product</h3>
                            <button onClick={() => modalRef.current?.close()} className="text-slate-500 hover:text-slate-700">✕</button>
                        </div>
                        {editingProduct && (
                            <form action={async (formData) => {
                                await updateProduct(formData)
                                modalRef.current?.close()
                            }} className="p-4 space-y-4">
                                <input type="hidden" name="id" value={editingProduct.id} />
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Name</label>
                                    <Input name="name" defaultValue={editingProduct.name} required />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">SKU</label>
                                        <Input name="sku" defaultValue={editingProduct.sku || ''} />
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Stock</label>
                                        <Input name="stock_qty" type="number" defaultValue={editingProduct.stock_qty} required />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Cost Price</label>
                                        <Input name="cost_price" type="number" step="0.01" defaultValue={editingProduct.cost_price || ''} />
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-sm font-medium">Sell Price</label>
                                        <Input name="sell_price" type="number" step="0.01" defaultValue={editingProduct.sell_price || ''} />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Category</label>
                                    <select name="category_id" defaultValue={editingProduct.category_id || ''} className="input w-full">
                                        <option value="">Uncategorized</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="pt-2 flex justify-end gap-2">
                                    <Button type="button" variant="outline" onClick={() => modalRef.current?.close()}>Cancel</Button>
                                    <Button type="submit">Save Changes</Button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </dialog>

            {/* Add Product Modal */}
            <dialog ref={addModalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="flex items-center justify-between border-b p-4">
                            <h3 className="font-semibold text-lg">Add New Product</h3>
                            <button onClick={() => addModalRef.current?.close()} className="text-slate-500 hover:text-slate-700">✕</button>
                        </div>
                        <form action={async (formData) => {
                            await addProductAction(formData)
                            addModalRef.current?.close()
                        }} className="p-4 space-y-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">Name</label>
                                <Input name="name" placeholder="Product Name" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">SKU</label>
                                    <Input name="sku" placeholder="Optional SKU" />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Stock</label>
                                    <Input name="stock_qty" type="number" defaultValue="0" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Cost Price</label>
                                    <Input name="cost_price" type="number" step="0.01" placeholder="0.00" />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium">Sell Price</label>
                                    <Input name="sell_price" type="number" step="0.01" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">Category</label>
                                <select name="category_id" className="input w-full">
                                    <option value="">Select Category...</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="pt-2 flex justify-end gap-2">
                                <Button type="button" variant="outline" onClick={() => addModalRef.current?.close()}>Cancel</Button>
                                <Button type="submit">Create Product</Button>
                            </div>
                        </form>
                    </div>
                </div>
            </dialog>
        </div>
    )
}

function ProductList({ products, onEdit }: { products: Product[], onEdit: (p: Product) => void }) {
    if (!products.length) return <p className="text-sm text-slate-500 italic py-4 text-center">No products in this category.</p>

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[40%]">Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {products.map((p) => (
                    <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{p.sku || '-'}</TableCell>
                        <TableCell>${Number(p.cost_price).toFixed(2)}</TableCell>
                        <TableCell>${Number(p.sell_price).toFixed(2)}</TableCell>
                        <TableCell>
                            <Badge variant={p.stock_qty > 0 ? 'secondary' : 'destructive'} className="font-mono">
                                {p.stock_qty}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}
