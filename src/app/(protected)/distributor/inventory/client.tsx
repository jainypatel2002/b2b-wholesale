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

interface CategoryNode {
    id: string
    name: string
    category_id: string
}

interface Product {
    id: string
    name: string
    sku: string | null
    cost_price: number | null
    sell_price: number | null
    stock_qty: number
    category_id: string | null
    category_node_id: string | null
    categories?: { name: string } | null
    category_nodes?: { name: string } | null

    // New fields
    stock_pieces?: number
    allow_case?: boolean
    allow_piece?: boolean
    units_per_case?: number
    low_stock_threshold?: number

    // Pricing Mode Fields
    cost_case?: number | null
    price_case?: number | null
    cost_mode?: 'unit' | 'case'
    price_mode?: 'unit' | 'case'
    stock_mode?: 'pieces' | 'cases'
    stock_locked?: boolean
    locked_stock_qty?: number | null
}

interface InventoryClientProps {
    initialProducts: Product[]
    categories: Category[]
    categoryNodes: CategoryNode[]
}

export function InventoryClient({ initialProducts, categories, categoryNodes }: InventoryClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [showLowStock, setShowLowStock] = useState(false)
    const [filterCategory, setFilterCategory] = useState<string>('all')

    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
    const modalRef = useRef<HTMLDialogElement>(null)
    const addModalRef = useRef<HTMLDialogElement>(null)
    const deleteModalRef = useRef<HTMLDialogElement>(null)

    // Filter products based on search term
    const filteredProducts = useMemo(() => {
        let res = initialProducts

        // ... (sorting logic if needed, or rely on created_at from server)

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
                (p.categories?.name && p.categories.name.toLowerCase().includes(lowerTerm)) ||
                (p.category_nodes?.name && p.category_nodes.name.toLowerCase().includes(lowerTerm))
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

    const handleDeleteClick = (p: Product) => {
        setDeletingProduct(p)
        deleteModalRef.current?.showModal()
    }

    const confirmDelete = async () => {
        if (!deletingProduct) return
        try {
            await deleteProduct(deletingProduct.id)
            deleteModalRef.current?.close()
            setDeletingProduct(null)
        } catch (error) {
            console.error(error)
            alert('Failed to delete product')
        }
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
                <ProductGroup
                    key={catId}
                    title={getCategoryName(catId)}
                    products={products}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                />
            ))}

            {groupedData.uncat.length > 0 && (
                <ProductGroup
                    title="Uncategorized"
                    products={groupedData.uncat}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                />
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
                                categoryNodes={categoryNodes}
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
                            categoryNodes={categoryNodes}
                            type="add"
                            onCancel={() => addModalRef.current?.close()}
                        />
                    </div>
                </div>
            </dialog>

            {/* Delete Confirmation Modal */}
            <dialog ref={deleteModalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6">
                        <h3 className="font-semibold text-lg text-red-600 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            Confirm Deletion
                        </h3>
                        <p className="mt-2 text-slate-600">
                            Are you sure you want to delete <strong>{deletingProduct?.name}</strong>?
                            This action cannot be undone.
                        </p>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => deleteModalRef.current?.close()}>Cancel</Button>
                            <Button variant="destructive" onClick={confirmDelete}>Delete Product</Button>
                        </div>
                    </div>
                </div>
            </dialog>
        </div>
    )
}

import { ChevronDown, ChevronUp } from 'lucide-react'

function ProductGroup({ title, products, onEdit, onDelete }: { title: string, products: Product[], onEdit: (p: Product) => void, onDelete: (p: Product) => void }) {
    const [isOpen, setIsOpen] = useState(true)

    return (
        <Card>
            <CardHeader className="py-4 cursor-pointer select-none hover:bg-slate-50 transition-colors" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Package className="h-5 w-5 text-slate-500" />
                        {title}
                        <Badge variant="secondary" className="ml-2">{products.length}</Badge>
                    </CardTitle>
                    {isOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                </div>
            </CardHeader>
            {isOpen && (
                <CardContent className="p-0">
                    {/* Desktop Table */}
                    <div className="hidden md:block">
                        <ProductList products={products} onEdit={onEdit} onDelete={onDelete} />
                    </div>
                    {/* Mobile Cards */}
                    <div className="md:hidden">
                        <ProductMobileList products={products} onEdit={onEdit} onDelete={onDelete} />
                    </div>
                </CardContent>
            )}
        </Card>
    )
}

function ProductList({ products, onEdit, onDelete }: { products: Product[], onEdit: (p: Product) => void, onDelete: (p: Product) => void }) {
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
                                <div className="flex flex-col">
                                    <span>{p.name}</span>
                                    {p.category_nodes && <span className="text-[10px] text-slate-400">{p.category_nodes.name}</span>}
                                    {isLow && <Badge variant="destructive" className="w-fit mt-1 text-[10px] h-5 px-1">Low Stock</Badge>}
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{p.sku || '-'}</TableCell>
                            <TableCell>${Number(p.cost_price).toFixed(2)}</TableCell>
                            <TableCell>${Number(p.sell_price).toFixed(2)}</TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1 w-fit">
                                    <span className={`font-mono ${isLow ? 'text-red-600 font-bold' : ''}`}>
                                        {p.stock_pieces}
                                    </span>
                                    {p.stock_locked && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 leading-none bg-amber-50 text-amber-600 border-amber-200 w-fit">
                                            Locked
                                        </Badge>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">
                                {p.allow_piece && <span className="block">Pieces</span>}
                                {p.allow_case && <span className="block">Cases ({p.units_per_case}/case)</span>}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(p)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}

function ProductMobileList({ products, onEdit, onDelete }: { products: Product[], onEdit: (p: Product) => void, onDelete: (p: Product) => void }) {
    if (!products.length) return <p className="text-sm text-slate-500 italic py-4 text-center">No products in this category.</p>

    return (
        <div className="divide-y divide-slate-100">
            {products.map((p) => {
                const isLow = (p.stock_pieces ?? 0) <= (p.low_stock_threshold ?? 5)
                return (
                    <div key={p.id} className="p-4 flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-medium text-slate-900">{p.name}</h4>
                                {p.category_nodes && <span className="text-xs text-slate-500 mr-2">{p.category_nodes.name}</span>}
                                {isLow && <Badge variant="destructive" className="text-[10px] h-5 px-1">Low Stock</Badge>}
                            </div>
                            <div className="flex bg-slate-50 rounded-lg">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(p)}>
                                    <Edit className="h-4 w-4 text-slate-600" />
                                </Button>
                                <div className="w-px bg-slate-200 my-1"></div>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(p)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                            <div>
                                <span className="text-xs text-slate-500 block">Price</span>
                                <span className="font-medium">${Number(p.sell_price).toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block">Stock</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`font-medium ${isLow ? 'text-red-600' : ''}`}>{p.stock_pieces} units</span>
                                    {p.stock_locked && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 leading-none bg-amber-50 text-amber-600 border-amber-200">Locked</Badge>}
                                </div>
                            </div>
                        </div>
                        {p.sku && <div className="text-xs text-slate-400 font-mono">SKU: {p.sku}</div>}
                    </div>
                )
            })}
        </div>
    )
}

// @ts-ignore
import { useFormStatus } from 'react-dom'
import { createProductAction, updateProductAction, deleteProduct } from './actions'
import { useEffect, useActionState } from 'react' // Import useActionState from react
import { AlertCircle, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ... (other imports)

// ProductForm Component using useActionState
function ProductForm({ defaultValues, categories, categoryNodes, type, onCancel }: {
    defaultValues?: any,
    categories: any[],
    categoryNodes: any[],
    type: 'add' | 'edit',
    onCancel: () => void
}) {
    // Configuration Fields
    const [allowCase, setAllowCase] = useState(defaultValues?.allow_case ?? false)
    const [allowPiece, setAllowPiece] = useState(defaultValues?.allow_piece ?? true)

    // Lock Stock Fields
    const [stockLocked, setStockLocked] = useState(defaultValues?.stock_locked ?? false)
    const [lockedStockQty, setLockedStockQty] = useState<string>(defaultValues?.locked_stock_qty != null ? String(defaultValues.locked_stock_qty) : '')

    // Units per Case (Central to calculations)
    const [unitsPerCase, setUnitsPerCase] = useState<number>(defaultValues?.units_per_case || 1)

    // Subcategory logic
    const [selectedCategory, setSelectedCategory] = useState(defaultValues?.category_id || '')
    const [selectedSubcategory, setSelectedSubcategory] = useState(defaultValues?.category_node_id || '')

    // Pricing Modes
    const [costMode, setCostMode] = useState<'unit' | 'case'>(defaultValues?.cost_mode || 'unit')
    const [priceMode, setPriceMode] = useState<'unit' | 'case'>(defaultValues?.price_mode || 'unit')

    // Derived Pricing Values (for display/input)
    // We store the RAW input values in state to avoid jumping cursor issues,
    // but the actual submission will use hidden fields or be calculated on server if we send raw.
    // However, to show "Calculated" values, we need state.

    // Initial load: prefer stored mode values if available, else derive
    const initialCostVal = defaultValues?.cost_mode === 'case' ? defaultValues?.cost_case : defaultValues?.cost_price
    const initialSellVal = defaultValues?.price_mode === 'case' ? defaultValues?.price_case : defaultValues?.sell_price

    const [costInput, setCostInput] = useState<string>(initialCostVal ? String(initialCostVal) : '')
    const [sellInput, setSellInput] = useState<string>(initialSellVal ? String(initialSellVal) : '')

    // Stock Logic
    const [stockMode, setStockMode] = useState<'pieces' | 'cases'>(defaultValues?.stock_mode || 'pieces')
    // Derive initial stock input based on mode
    const initialCanonicalStock = defaultValues?.stock_pieces || defaultValues?.stock_qty || 0
    const initialStockInput = useMemo(() => {
        if (defaultValues?.stock_mode === 'cases' && defaultValues.units_per_case > 1) {
            return String(initialCanonicalStock / defaultValues.units_per_case)
        }
        return String(initialCanonicalStock)
    }, [defaultValues])

    const [stockInput, setStockInput] = useState<string>(initialStockInput)

    // Recalculate input if mode changes? 
    // UX: If user toggles mode, convert the input value
    // We use a ref to track if the change comes from toggle vs user typing? 
    // Actually, simplest is to just convert the value when toggling.
    const prevStockMode = useRef(stockMode)
    useEffect(() => {
        if (prevStockMode.current !== stockMode) {
            const val = Number(stockInput)
            if (!isNaN(val)) {
                if (stockMode === 'cases') {
                    // Pieces -> Cases
                    setStockInput(String(val / unitsPerCase)) // keep decimals if any
                } else {
                    // Cases -> Pieces
                    setStockInput(String(val * unitsPerCase))
                }
            }
            prevStockMode.current = stockMode
        }
    }, [stockMode, unitsPerCase])

    // Calculation Helpers
    const getCostPerUnit = () => {
        const val = Number(costInput)
        if (isNaN(val)) return 0
        if (costMode === 'unit') return val
        return val / Math.max(1, unitsPerCase)
    }

    const getSellPerUnit = () => {
        const val = Number(sellInput)
        if (isNaN(val)) return 0
        if (priceMode === 'unit') return val
        return val / Math.max(1, unitsPerCase)
    }

    const getCostPerCase = () => {
        const val = Number(costInput)
        if (isNaN(val)) return 0
        if (costMode === 'case') return val
        return val * Math.max(1, unitsPerCase)
    }

    const getSellPerCase = () => {
        const val = Number(sellInput)
        if (isNaN(val)) return 0
        if (priceMode === 'case') return val
        return val * Math.max(1, unitsPerCase)
    }

    // Filter subcategories based on selected category
    const availableSubcategories = categoryNodes.filter(s => s.category_id === selectedCategory)

    // Reset subcategory when category changes (but not on initial load)
    const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVal = e.target.value
        setSelectedCategory(newVal)
        if (newVal !== defaultValues?.category_id) {
            setSelectedSubcategory('')
        }
    }

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

            {/* Hidden fields to pass canonical values and modes to server */}
            <input type="hidden" name="cost_mode" value={costMode} />
            <input type="hidden" name="price_mode" value={priceMode} />
            {/* We will send the calculated UNIT prices as the standard fields, 
                and also the CASE prices as extra fields. 
                Ideally, the server should validate, but we can compute here for convenience.
            */}
            <input type="hidden" name="cost_price" value={getCostPerUnit()} />
            <input type="hidden" name="sell_price" value={getSellPerUnit()} />
            <input type="hidden" name="cost_case" value={getCostPerCase()} />
            <input type="hidden" name="price_case" value={getSellPerCase()} />


            <div className="grid gap-2">
                <label className="text-sm font-medium">Name</label>
                <Input name="name" defaultValue={defaultValues?.name} required placeholder="Product Name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <label className="text-sm font-medium">SKU</label>
                    <Input name="sku" defaultValue={defaultValues?.sku || ''} placeholder="SKU-123" />
                </div>
                {/* Category & Subcategory */}
                <div className="flex flex-col gap-2 col-span-2 sm:col-span-1">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Category</label>
                        <select
                            name="category_id"
                            value={selectedCategory}
                            onChange={handleCategoryChange}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Uncategorized</option>
                            {categories.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Subcategory Row (Dependent) */}
            <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-600">Subcategory</label>
                <select
                    name="category_node_id"
                    value={selectedSubcategory}
                    onChange={(e) => setSelectedSubcategory(e.target.value)}
                    disabled={!selectedCategory || availableSubcategories.length === 0}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-100"
                >
                    <option value="">{availableSubcategories.length === 0 ? 'No subcategories available' : 'Select Subcategory (Optional)'}</option>
                    {availableSubcategories.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
            </div>

            {/* Ordering Configuration */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                <p className="text-sm font-medium text-slate-700">Ordering Configuration</p>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Units Per Case</label>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            name="units_per_case"
                            value={unitsPerCase}
                            onChange={(e) => setUnitsPerCase(Number(e.target.value))}
                            min="1"
                            required
                            className="w-full"
                        />
                        <span className="text-xs text-slate-500 whitespace-nowrap">items/case</span>
                    </div>

                </div>
                <div className="flex gap-6 pt-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="allow_piece" checked={allowPiece} onChange={e => setAllowPiece(e.target.checked)} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                        Allow Pieces
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="allow_case" checked={allowCase} onChange={e => setAllowCase(e.target.checked)} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
                        Allow Cases
                    </label>
                </div>
            </div>

            {/* Pricing Section with Toggles */}
            <div className="space-y-4 pt-2">
                <h4 className="text-sm font-semibold text-slate-900">Pricing</h4>

                {/* Cost Price */}
                <div className="grid gap-2 p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Cost Price</label>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setCostMode('unit')}
                                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${costMode === 'unit' ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Per Unit
                            </button>
                            <button
                                type="button"
                                onClick={() => setCostMode('case')}
                                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${costMode === 'case' ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Per Case
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                        <Input
                            value={costInput}
                            onChange={e => setCostInput(e.target.value)}
                            type="number"
                            step="0.0001"
                            placeholder="0.00"
                            className="pl-7"
                        />
                    </div>
                    {/* Calculation Helper */}
                    <p className="text-xs text-slate-500 text-right">
                        {costMode === 'unit'
                            ? `~ $${getCostPerCase().toFixed(2)} per case`
                            : `~ $${getCostPerUnit().toFixed(2)} per unit`
                        }
                    </p>
                </div>

                {/* Sell Price */}
                <div className="grid gap-2 p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Sell Price</label>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setPriceMode('unit')}
                                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${priceMode === 'unit' ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Per Unit
                            </button>
                            <button
                                type="button"
                                onClick={() => setPriceMode('case')}
                                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${priceMode === 'case' ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Per Case
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                        <Input
                            value={sellInput}
                            onChange={e => setSellInput(e.target.value)}
                            type="number"
                            step="0.0001"
                            placeholder="0.00"
                            className="pl-7"
                        />
                    </div>
                    {/* Calculation Helper */}
                    <p className="text-xs text-slate-500 text-right">
                        {priceMode === 'unit'
                            ? `~ $${getSellPerCase().toFixed(2)} per case`
                            : `~ $${getSellPerUnit().toFixed(2)} per unit`
                        }
                    </p>
                </div>
            </div>

            {/* Stock Section with Mode Toggle */}
            <div className="grid gap-2 p-3 border rounded-lg bg-slate-50 relative">

                {/* Lock Setting Header */}
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold flex items-center gap-2 text-slate-800 cursor-pointer">
                        <input
                            type="checkbox"
                            name="stock_locked"
                            checked={stockLocked}
                            onChange={e => {
                                setStockLocked(e.target.checked)
                                if (e.target.checked && !lockedStockQty && stockInput) {
                                    setLockedStockQty(stockMode === 'cases' ? String(Number(stockInput || 0) * unitsPerCase) : stockInput)
                                }
                            }}
                            className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 shadow-sm"
                            value="true"
                        />
                        Lock Stock Quantity
                    </label>
                    {stockLocked && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 pointer-events-none">Locked</Badge>}
                </div>

                {stockLocked && (
                    <div className="grid gap-1 mb-2 p-3 bg-white border border-amber-100 rounded-md shadow-sm">
                        <label className="text-xs font-medium text-amber-800">Forced Stock Level (Total Units)</label>
                        <div className="relative">
                            <Input
                                name="locked_stock_qty"
                                value={lockedStockQty}
                                onChange={e => setLockedStockQty(e.target.value)}
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                required={stockLocked}
                                className="border-amber-200 focus-visible:ring-amber-500 bg-amber-50/30 font-mono"
                            />
                            <span className="absolute right-3 top-2.5 text-amber-600/60 text-xs pointer-events-none">units</span>
                        </div>
                        <p className="text-[10px] text-amber-700 leading-tight">Orders will not deduct from this amount.</p>
                    </div>
                )}

                <div className={`flex items-center justify-between transition-opacity ${stockLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                    <label className="text-sm font-medium">Current Stock</label>
                    <div className="flex bg-slate-200 p-0.5 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setStockMode('pieces')}
                            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${stockMode === 'pieces' ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Pieces (Units)
                        </button>
                        <button
                            type="button"
                            onClick={() => setStockMode('cases')}
                            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${stockMode === 'cases' ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Cases
                        </button>
                    </div>
                </div>

                <div className={`grid gap-1 transition-opacity ${stockLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="relative">
                        <Input
                            value={stockInput}
                            onChange={e => setStockInput(e.target.value)}
                            type="number"
                            step={stockMode === 'cases' ? "1" : "1"}
                            min="0"
                            placeholder="0"
                            required={!stockLocked}
                        />
                        <span className="absolute right-3 top-2.5 text-slate-400 text-xs pointer-events-none">
                            {stockMode === 'pieces' ? 'units' : `cases (@ ${unitsPerCase}/case)`}
                        </span>
                    </div>

                    {/* Helper Text */}
                    <p className="text-xs text-slate-500 text-right">
                        {stockMode === 'pieces'
                            ? unitsPerCase > 1 ? `≈ ${(Number(stockInput || 0) / unitsPerCase).toFixed(1)} cases` : ''
                            : `= ${Number(stockInput || 0) * unitsPerCase} total units`
                        }
                    </p>
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-medium">Low Stock Warning</label>
                <Input name="low_stock_threshold" type="number" defaultValue={defaultValues?.low_stock_threshold || 5} />
            </div>

            {/* Hidden fields for Stock */}
            <input type="hidden" name="stock_mode" value={stockMode} />
            {/* Canonical stock_qty (Legacy/Standard) is always UNITS */}
            <input
                type="hidden"
                name="stock_qty"
                value={stockMode === 'cases' ? Number(stockInput || 0) * unitsPerCase : Number(stockInput || 0)}
            />

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
