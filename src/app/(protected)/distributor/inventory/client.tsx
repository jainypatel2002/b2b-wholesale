'use client'

import React, { useState, useMemo, useRef } from 'react'
import { Search, Plus, Edit, Package } from 'lucide-react'
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

    // New fields
    stock_pieces?: number
    allow_case?: boolean
    allow_piece?: boolean
    units_per_case?: number
    low_stock_threshold?: number
}

interface InventoryClientProps {
    initialProducts: Product[]
    categories: Category[]
}

export function InventoryClient({ initialProducts, categories }: InventoryClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [showLowStock, setShowLowStock] = useState(false)
    const [filterCategory, setFilterCategory] = useState<string>('all')

    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const modalRef = useRef<HTMLDialogElement>(null)
    const addModalRef = useRef<HTMLDialogElement>(null)

    // Filter products based on search term
    const filteredProducts = useMemo(() => {
        let res = initialProducts

        if (showLowStock) {
            res = res.filter(p => (p.stock_pieces ?? 0) <= (p.low_stock_threshold ?? 5))
        }

        if (filterCategory !== 'all') {
            res = res.filter(p => p.category_id === filterCategory)
        }

        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase()
            res = res.filter(p =>
                p.name.toLowerCase().includes(lowerTerm) ||
                (p.sku && p.sku.toLowerCase().includes(lowerTerm)) ||
                (p.categories?.name && p.categories.name.toLowerCase().includes(lowerTerm))
            )
        }
        return res
    }, [initialProducts, searchTerm, showLowStock, filterCategory])

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
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Search products, SKUs..."
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

                <div className="flex gap-2 items-center flex-wrap">
                    <select
                        className="h-10 rounded-md border border-slate-200 px-3 py-1 text-sm bg-white"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                    >
                        <option value="all">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <Button
                        variant={showLowStock ? "destructive" : "outline"}
                        onClick={() => setShowLowStock(!showLowStock)}
                        size="sm"
                    >
                        {showLowStock ? 'Show All' : 'Show Low Stock'}
                    </Button>
                </div>
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
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b p-4">
                            <h3 className="font-semibold text-lg">Edit Product</h3>
                            <button onClick={() => modalRef.current?.close()} className="text-slate-500 hover:text-slate-700">✕</button>
                        </div>
                        {editingProduct && (
                            <ProductForm
                                defaultValues={editingProduct}
                                categories={categories}
                                type="edit"
                                onCancel={() => modalRef.current?.close()}
                            />
                        )}
                    </div>
                </div>
            </dialog>

            {/* Add Product Modal */}
            <dialog ref={addModalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b p-4">
                            <h3 className="font-semibold text-lg">Add New Product</h3>
                            <button onClick={() => addModalRef.current?.close()} className="text-slate-500 hover:text-slate-700">✕</button>
                        </div>
                        <ProductForm
                            categories={categories}
                            type="add"
                            onCancel={() => addModalRef.current?.close()}
                        />
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
                    <TableHead className="w-[30%]">Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {products.map((p) => {
                    const isLow = (p.stock_pieces ?? 0) <= (p.low_stock_threshold ?? 5)
                    return (
                        <TableRow key={p.id}>
                            <TableCell className="font-medium">
                                {p.name}
                                {isLow && <Badge variant="destructive" className="ml-2 text-[10px] h-5 px-1">Low Stock</Badge>}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{p.sku || '-'}</TableCell>
                            <TableCell>${Number(p.cost_price).toFixed(2)}</TableCell>
                            <TableCell>${Number(p.sell_price).toFixed(2)}</TableCell>
                            <TableCell>
                                <span className={`font-mono ${isLow ? 'text-red-600 font-bold' : ''}`}>
                                    {p.stock_pieces}
                                </span>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">
                                {p.allow_piece && <span className="block">Pieces</span>}
                                {p.allow_case && <span className="block">Cases ({p.units_per_case}/case)</span>}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}

// @ts-ignore
import { useFormStatus } from 'react-dom'
import { createProductAction, updateProductAction } from './actions'
import { useEffect, useActionState } from 'react' // Import useActionState from react
import { AlertCircle } from 'lucide-react'

// ... (other imports)

// ProductForm Component using useActionState
function ProductForm({ defaultValues, categories, type, onCancel }: {
    defaultValues?: any,
    categories: any[],
    type: 'add' | 'edit',
    onCancel: () => void
}) {
    const [allowCase, setAllowCase] = useState(defaultValues?.allow_case ?? false)
    const [allowPiece, setAllowPiece] = useState(defaultValues?.allow_piece ?? true)

    const serverAction = type === 'edit' ? updateProductAction : createProductAction
    const [state, formAction, isPending] = useActionState(serverAction, { success: false, error: null })

    useEffect(() => {
        if (state.success) {
            onCancel()
        }
    }, [state.success, onCancel])

    return (
        <form action={formAction} className="p-4 space-y-4">
            {state.error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {state.error}
                </div>
            )}

            {type === 'edit' && <input type="hidden" name="id" value={defaultValues.id} />}

            <div className="grid gap-2">
                <label className="text-sm font-medium">Name</label>
                <Input name="name" defaultValue={defaultValues?.name} required placeholder="Product Name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <label className="text-sm font-medium">SKU</label>
                    <Input name="sku" defaultValue={defaultValues?.sku || ''} placeholder="SKU-123" />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Category</label>
                    <select name="category_id" defaultValue={defaultValues?.category_id || ''} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                        <option value="">Uncategorized</option>
                        {categories.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                <p className="text-sm font-medium text-slate-700">Ordering Options</p>
                <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="allow_piece" checked={allowPiece} onChange={e => setAllowPiece(e.target.checked)} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                        Allow Pieces
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="allow_case" checked={allowCase} onChange={e => setAllowCase(e.target.checked)} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                        Allow Cases
                    </label>
                </div>

                {allowCase && (
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Units Per Case <span className="text-red-500">*</span></label>
                        <Input type="number" name="units_per_case" defaultValue={defaultValues?.units_per_case || 12} min="2" required />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Stock (Total Pieces)</label>
                    <Input name="stock_qty" type="number" defaultValue={defaultValues?.stock_pieces || defaultValues?.stock_qty || 0} required />
                    <p className="text-[10px] text-slate-500">Total individual units</p>
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Low Stock Warning</label>
                    <Input name="low_stock_threshold" type="number" defaultValue={defaultValues?.low_stock_threshold || 5} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Cost Price (Per Piece)</label>
                    <Input name="cost_price" type="number" step="0.01" defaultValue={defaultValues?.cost_price || ''} placeholder="0.00" />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Sell Price (Per Piece)</label>
                    <Input name="sell_price" type="number" step="0.01" defaultValue={defaultValues?.sell_price || ''} placeholder="0.00" />
                </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <SubmitButton label={type === 'edit' ? 'Save Changes' : 'Create Product'} />
            </div>
        </form>
    )
}

function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : label}
        </Button>
    )
}
