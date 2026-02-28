'use client'

import React, { useState, useMemo, useRef, useCallback, useEffect, useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Check, ChevronDown, ChevronUp, Copy, Edit, Package, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarcodeScannerPanel, SCAN_CATCHER_ID } from '@/components/scanner/BarcodeScannerPanel'
import type { ScanStatus } from '@/components/scanner/BarcodeScannerPanel'
import { BarcodeScanModal } from '@/components/scanner/BarcodeScanModal'
import { CameraBarcodeScannerModal } from '@/components/scanner/CameraBarcodeScannerModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { createClient } from '@/lib/supabase/client'
import { addBarcodeToProduct, deleteProduct, createProductAction, updateProductAction } from './actions'
import { formatMoney, resolveCaseUnitPrices, safeUnitsPerCase, toCaseFromUnit, toUnitFromCase } from '@/lib/pricing/display'
import { filterCategoryNodesForCategory, isCategoryNodeInCategory } from '@/lib/inventory/category-node-utils'
import { normalizeBarcode } from '@/lib/utils/barcode'

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
    cost_per_unit?: number | null
    sell_per_unit?: number | null
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
    cost_per_case?: number | null
    sell_per_case?: number | null
    cost_mode?: 'unit' | 'case'
    price_mode?: 'unit' | 'case'
    stock_mode?: 'pieces' | 'cases'
    stock_locked?: boolean
    locked_stock_qty?: number | null
    barcode?: string | null
    barcodes?: ProductBarcode[]
}

interface ProductBarcode {
    id: string
    barcode: string
    is_primary: boolean
    created_at?: string
}

type BarcodeDraft = {
    id: string
    value: string
    isPrimary: boolean
}

function createBarcodeDraft(value: string, isPrimary = false): BarcodeDraft {
    const normalized = normalizeBarcode(value)
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        value: normalized || value.trim(),
        isPrimary,
    }
}

function normalizeBarcodeDrafts(drafts: BarcodeDraft[]): Array<{ barcode: string; isPrimary: boolean }> {
    const normalized: Array<{ barcode: string; isPrimary: boolean }> = []
    const seen = new Set<string>()

    for (const draft of drafts) {
        const barcode = normalizeBarcode(draft.value)
        if (!barcode || seen.has(barcode)) continue
        seen.add(barcode)
        normalized.push({ barcode, isPrimary: draft.isPrimary })
    }

    if (normalized.length === 0) return []
    const primary = normalized.find((entry) => entry.isPrimary)?.barcode ?? normalized[0].barcode
    return normalized.map((entry) => ({ barcode: entry.barcode, isPrimary: entry.barcode === primary }))
}

function buildInitialBarcodeDrafts(defaultValues?: Product, pendingScannedBarcode?: string | null): BarcodeDraft[] {
    const source: string[] = []

    if (Array.isArray(defaultValues?.barcodes) && defaultValues?.barcodes.length > 0) {
        const sorted = [...defaultValues.barcodes].sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1
            if (!a.is_primary && b.is_primary) return 1
            return a.barcode.localeCompare(b.barcode)
        })
        source.push(...sorted.map((entry) => entry.barcode))
    } else if (defaultValues?.barcode) {
        source.push(defaultValues.barcode)
    }

    if (pendingScannedBarcode) {
        source.unshift(pendingScannedBarcode)
    }

    const drafts: BarcodeDraft[] = []
    const seen = new Set<string>()
    for (const value of source) {
        const normalized = normalizeBarcode(value)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        drafts.push(createBarcodeDraft(normalized, drafts.length === 0))
    }

    if (drafts.length === 0) return []
    drafts[0].isPrimary = true
    for (let i = 1; i < drafts.length; i += 1) drafts[i].isPrimary = false
    return drafts
}

interface InventoryClientProps {
    initialProducts: Product[]
    categories: Category[]
    categoryNodes: CategoryNode[]
    distributorId: string
}

export function InventoryClient({ initialProducts, categories, categoryNodes, distributorId }: InventoryClientProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [showLowStock, setShowLowStock] = useState(false)
    const [filterCategory, setFilterCategory] = useState<string>('all')

    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
    const modalRef = useRef<HTMLDialogElement>(null)
    const addModalRef = useRef<HTMLDialogElement>(null)
    const deleteModalRef = useRef<HTMLDialogElement>(null)

    // ── Barcode Scanner State ──
    const [scanMode, setScanMode] = useState(false)
    const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
    const [scanStatusMessage, setScanStatusMessage] = useState('')
    const [pendingScannedBarcode, setPendingScannedBarcode] = useState<string | null>(null)

    // ── Camera Scanner State ──
    const [cameraOpen, setCameraOpen] = useState(false)
    const [cameraError, setCameraError] = useState<string | null>(null)
    const cameraStreamRef = useRef<MediaStream | null>(null)
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
    const [autoFallback, setAutoFallback] = useState(false)
    const autoFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastScanActivityRef = useRef<number>(0)
    const [showAutoFallbackPrompt, setShowAutoFallbackPrompt] = useState(false)

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
                (p.barcode && p.barcode.toLowerCase().includes(lowerTerm)) ||
                (p.barcodes && p.barcodes.some((entry) => entry.barcode.toLowerCase().includes(lowerTerm))) ||
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

    const openAddModal = (barcode?: string | null) => {
        setPendingScannedBarcode(barcode ?? null)
        if (!addModalRef.current?.open) {
            addModalRef.current?.showModal()
        }
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

    // ── Barcode Scan Handler ──
    const handleBarcodeScan = useCallback(async (barcode: string) => {
        const normalizedBarcode = normalizeBarcode(barcode)
        if (!normalizedBarcode || normalizedBarcode.length < 6) {
            setScanStatus('error')
            setScanStatusMessage('Invalid barcode scan')
            setTimeout(() => {
                if (scanMode) { setScanStatus('ready'); setScanStatusMessage('') }
            }, 2500)
            return
        }

        setScanStatus('searching')
        setScanStatusMessage(`Looking up ${normalizedBarcode}…`)

        try {
            // First check in-memory (already loaded products)
            const localMatch = initialProducts.find(
                p =>
                    p.barcode?.toLowerCase() === normalizedBarcode.toLowerCase()
                    || p.barcodes?.some((entry) => entry.barcode.toLowerCase() === normalizedBarcode.toLowerCase())
            )

            if (localMatch) {
                setScanStatus('found')
                setScanStatusMessage(`Found: ${localMatch.name}`)
                handleEdit(localMatch)
                setTimeout(() => {
                    if (scanMode) { setScanStatus('ready'); setScanStatusMessage('') }
                }, 3000)
                return
            }

            const response = await fetch(
                `/api/distributor/inventory/barcode?barcode=${encodeURIComponent(normalizedBarcode)}`,
                { method: 'GET', cache: 'no-store' }
            )
            const payload = await response.json().catch(() => ({}))

            if (!response.ok) {
                console.error('Distributor barcode lookup error:', payload)
                setScanStatus('error')
                setScanStatusMessage(payload?.error || 'Lookup failed. Try again.')
                setTimeout(() => {
                    if (scanMode) { setScanStatus('ready'); setScanStatusMessage('') }
                }, 3000)
                return
            }

            if (payload?.product) {
                const product: Product = payload.product as Product
                setScanStatus('found')
                setScanStatusMessage(`Found: ${product.name}`)
                handleEdit(product)
            } else {
                setScanStatus('not_found')
                setScanStatusMessage('New barcode — add product')
                openAddModal(normalizedBarcode)
            }

            setTimeout(() => {
                if (scanMode) { setScanStatus('ready'); setScanStatusMessage('') }
            }, 3000)
        } catch (err) {
            console.error('Barcode scan error:', err)
            setScanStatus('error')
            setScanStatusMessage('Lookup failed. Try again.')
            setTimeout(() => {
                if (scanMode) { setScanStatus('ready'); setScanStatusMessage('') }
            }, 3000)
        }
    }, [initialProducts, scanMode])

    useBarcodeScanner({
        enabled: scanMode,
        onScan: handleBarcodeScan,
        scanCatcherInputId: SCAN_CATCHER_ID,
    })

    const toggleScanMode = useCallback(() => {
        setScanMode(prev => {
            const next = !prev
            if (next) {
                setScanStatus('ready')
                setScanStatusMessage('')
                lastScanActivityRef.current = Date.now()
            } else {
                setScanStatus('idle')
                setScanStatusMessage('')
                // Clear auto-fallback timer
                if (autoFallbackTimerRef.current) {
                    clearTimeout(autoFallbackTimerRef.current)
                    autoFallbackTimerRef.current = null
                }
            }
            return next
        })
    }, [])

    // ── Auto-fallback: show prompt if no scan within 5 seconds ──
    // NOTE: Cannot auto-call getUserMedia from a timer (breaks iOS Safari gesture requirement)
    // Instead, show a "Tap to open camera" prompt that the user can click.
    useEffect(() => {
        if (!scanMode || !autoFallback) {
            if (autoFallbackTimerRef.current) {
                clearTimeout(autoFallbackTimerRef.current)
                autoFallbackTimerRef.current = null
            }
            setShowAutoFallbackPrompt(false)
            return
        }

        if (autoFallbackTimerRef.current) clearTimeout(autoFallbackTimerRef.current)
        autoFallbackTimerRef.current = setTimeout(() => {
            if (scanMode && autoFallback && scanStatus === 'ready') {
                setShowAutoFallbackPrompt(true)
            }
        }, 5000)

        return () => {
            if (autoFallbackTimerRef.current) {
                clearTimeout(autoFallbackTimerRef.current)
                autoFallbackTimerRef.current = null
            }
        }
    }, [scanMode, autoFallback, scanStatus])

    /**
     * CRITICAL: getUserMedia is called HERE, directly in the click handler,
     * to preserve the iOS Safari user-gesture requirement.
     */
    const openCamera = useCallback(async () => {
        console.info('[CameraScanner] openCamera called from user gesture')
        setCameraError(null)
        setCameraStream(null)
        setShowAutoFallbackPrompt(false)

        // Secure context check
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            console.error('[CameraScanner] Insecure context')
            setCameraError('insecure_context: Camera requires HTTPS or localhost.')
            setCameraOpen(true)
            setScanStatus('camera_active')
            setScanStatusMessage('Camera error')
            return
        }

        // API availability check
        if (!navigator?.mediaDevices?.getUserMedia) {
            console.error('[CameraScanner] getUserMedia not available')
            setCameraError('Camera not supported in this browser.')
            setCameraOpen(true)
            setScanStatus('camera_active')
            setScanStatusMessage('Camera error')
            return
        }

        // Open modal immediately so user sees spinner
        setCameraOpen(true)
        setScanStatus('camera_active')
        setScanStatusMessage('Starting camera…')

        try {
            console.info('[CameraScanner] Requesting getUserMedia (environment)')
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            })
            console.info('[CameraScanner] getUserMedia success, tracks:', stream.getTracks().length)
            cameraStreamRef.current = stream
            setCameraStream(stream)
            setScanStatusMessage('Camera active')
        } catch (err: any) {
            console.warn('[CameraScanner] Rear camera failed, trying fallback:', err.name)
            // Fallback: try any camera
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                console.info('[CameraScanner] Fallback getUserMedia success')
                cameraStreamRef.current = stream
                setCameraStream(stream)
                setScanStatusMessage('Camera active')
            } catch (err2: any) {
                console.error('[CameraScanner] getUserMedia failed:', err2.name, err2.message, err2.stack)
                setCameraError(`${err2.name}: ${err2.message}`)
                setScanStatusMessage('Camera error')
            }
        }
    }, [])

    const closeCamera = useCallback(() => {
        console.info('[CameraScanner] closeCamera')
        // Stop all tracks
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(t => t.stop())
            cameraStreamRef.current = null
        }
        setCameraStream(null)
        setCameraError(null)
        setCameraOpen(false)
        if (scanMode) {
            setScanStatus('ready')
            setScanStatusMessage('')
        } else {
            setScanStatus('idle')
            setScanStatusMessage('')
        }
    }, [scanMode])

    const handleCameraScan = useCallback((barcode: string) => {
        console.info('[CameraScanner] Barcode scanned via camera:', barcode)
        // Stream cleanup happens in modal via handleClose
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(t => t.stop())
            cameraStreamRef.current = null
        }
        setCameraStream(null)
        setCameraOpen(false)
        handleBarcodeScan(barcode)
    }, [handleBarcodeScan])

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Search products, SKUs..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => openAddModal()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Product
                    </Button>
                </div>

                {/* Barcode Scanner Panel */}
                <BarcodeScannerPanel
                    scanMode={scanMode}
                    onToggleScanMode={toggleScanMode}
                    status={scanStatus}
                    statusMessage={scanStatusMessage}
                    onOpenCamera={openCamera}
                    autoFallback={autoFallback}
                    onToggleAutoFallback={() => setAutoFallback(prev => !prev)}
                />

                <div className="flex gap-2 items-center flex-wrap">
                    <select
                        className="form-select min-w-[190px]"
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
                <div className="rounded-2xl border border-dashed border-[hsl(var(--surface-border))] bg-white/70 py-12 text-center">
                    <p className="text-slate-500">No products found matching your search.</p>
                </div>
            )}

            {/* Edit Modal */}
            <dialog ref={modalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg overflow-y-auto rounded-2xl border border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl max-h-[90vh]">
                        <div className="flex items-center justify-between border-b border-slate-200/70 p-4">
                            <h3 className="font-semibold text-lg">Edit Product</h3>
                            <button onClick={() => modalRef.current?.close()} className="focus-ring-brand rounded-md p-1 text-slate-500 hover:text-slate-700">✕</button>
                        </div>
                        {editingProduct && (
                            <ProductForm
                                key={editingProduct.id}
                                defaultValues={editingProduct}
                                categories={categories}
                                categoryNodes={categoryNodes}
                                distributorId={distributorId}
                                type="edit"
                                onCancel={() => {
                                    modalRef.current?.close()
                                    setEditingProduct(null)
                                }}
                            />
                        )}
                    </div>
                </div>
            </dialog>

            {/* Add Product Modal */}
            <dialog ref={addModalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg overflow-y-auto rounded-2xl border border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl max-h-[90vh]">
                        <div className="flex items-center justify-between border-b border-slate-200/70 p-4">
                            <h3 className="font-semibold text-lg">Add New Product</h3>
                            <button onClick={() => addModalRef.current?.close()} className="focus-ring-brand rounded-md p-1 text-slate-500 hover:text-slate-700">✕</button>
                        </div>
                        <ProductForm
                            categories={categories}
                            categoryNodes={categoryNodes}
                            distributorId={distributorId}
                            type="add"
                            onCancel={() => { addModalRef.current?.close(); setPendingScannedBarcode(null) }}
                            pendingScannedBarcode={pendingScannedBarcode}
                        />
                    </div>
                </div>
            </dialog>

            {/* Delete Confirmation Modal */}
            <dialog ref={deleteModalRef} className="modal bg-transparent">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur-xl">
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

            {/* Auto-fallback prompt (tap to open camera — preserves iOS gesture) */}
            {showAutoFallbackPrompt && !cameraOpen && (
                <button
                    type="button"
                    onClick={openCamera}
                    className="w-full rounded-xl border border-primary/25 bg-sky-50 px-4 py-3 text-center text-sm font-medium text-primary transition-colors hover:bg-sky-100 animate-pulse"
                >
                    📸 No scanner detected — tap to open camera
                </button>
            )}

            {/* Camera Barcode Scanner Modal */}
            <CameraBarcodeScannerModal
                open={cameraOpen}
                stream={cameraStream}
                cameraError={cameraError}
                onClose={closeCamera}
                onUseManualInput={() => {
                    closeCamera()
                    setScanMode(true)
                    setScanStatus('ready')
                    setScanStatusMessage('Ready for scanner input')
                    setTimeout(() => {
                        const catcher = document.getElementById(SCAN_CATCHER_ID) as HTMLInputElement | null
                        catcher?.focus()
                    }, 60)
                }}
                onScan={handleCameraScan}
            />
        </div>
    )
}

function ProductGroup({ title, products, onEdit, onDelete }: { title: string, products: Product[], onEdit: (p: Product) => void, onDelete: (p: Product) => void }) {
    const [isOpen, setIsOpen] = useState(true)

    return (
        <Card className="border-white/75 bg-white/80">
            <CardHeader className="cursor-pointer select-none py-4 transition-colors hover:bg-slate-50/80" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Package className="h-5 w-5 text-slate-500" />
                        <span>{title}</span>
                        <Badge variant="secondary" className="ml-1">{products.length}</Badge>
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

function getPriceDisplay(product: Product, kind: 'cost' | 'sell') {
    const resolved = kind === 'cost'
        ? resolveCaseUnitPrices({
            casePrice: product.cost_per_case ?? product.cost_case,
            unitPrice: product.cost_per_unit ?? product.cost_price,
            unitsPerCase: product.units_per_case
        })
        : resolveCaseUnitPrices({
            casePrice: product.sell_per_case ?? product.price_case,
            unitPrice: product.sell_per_unit ?? product.sell_price,
            unitsPerCase: product.units_per_case
        })

    const showCasePrimary = product.allow_case !== false && resolved.casePrice !== null
    return {
        primary: showCasePrimary ? resolved.casePrice : resolved.unitPrice,
        primarySuffix: showCasePrimary ? '/case' : '/unit',
        secondaryUnit: showCasePrimary ? resolved.unitPrice : null
    }
}

function ProductList({ products, onEdit, onDelete }: { products: Product[], onEdit: (p: Product) => void, onDelete: (p: Product) => void }) {
    if (!products.length) return <p className="py-4 text-center text-sm italic text-slate-500">No products in this category.</p>

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
                    const costDisplay = getPriceDisplay(p, 'cost')
                    const sellDisplay = getPriceDisplay(p, 'sell')
                    const primaryBarcode = p.barcodes?.find((entry) => entry.is_primary)?.barcode || p.barcode
                    return (
                        <TableRow key={p.id}>
                            <TableCell className="font-medium">
                                <div className="flex flex-col">
                                    <span>{p.name}</span>
                                    {p.category_nodes && <span className="text-[10px] text-slate-400">{p.category_nodes.name}</span>}
                                    {primaryBarcode && <span className="text-[10px] font-mono text-slate-400">Barcode: {primaryBarcode}</span>}
                                    {(p.barcodes?.length ?? 0) > 1 && (
                                        <span className="text-[10px] text-slate-400">{p.barcodes?.length} aliases</span>
                                    )}
                                    {isLow && <Badge variant="destructive" className="w-fit mt-1 text-[10px] h-5 px-1">Low Stock</Badge>}
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{p.sku || '-'}</TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    {costDisplay.primary !== null ? (
                                        <>
                                            <span className="text-base font-semibold text-slate-900">
                                                {formatMoney(costDisplay.primary)}
                                            </span>
                                            {costDisplay.secondaryUnit !== null && (
                                                <span className="text-xs text-slate-500">{formatMoney(costDisplay.secondaryUnit)}/unit</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-xs text-slate-400">Not set</span>
                                    )}
                                    {costDisplay.primary !== null && (
                                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{costDisplay.primarySuffix}</span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    {sellDisplay.primary !== null ? (
                                        <>
                                            <span className="text-base font-semibold text-slate-900">
                                                {formatMoney(sellDisplay.primary)}
                                            </span>
                                            {sellDisplay.secondaryUnit !== null && (
                                                <span className="text-xs text-slate-500">{formatMoney(sellDisplay.secondaryUnit)}/unit</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-xs text-slate-400">Not set</span>
                                    )}
                                    {sellDisplay.primary !== null && (
                                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{sellDisplay.primarySuffix}</span>
                                    )}
                                </div>
                            </TableCell>
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
                                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(p)}>
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
    if (!products.length) return <p className="py-4 text-center text-sm italic text-slate-500">No products in this category.</p>

    return (
        <div className="divide-y divide-slate-100/80">
            {products.map((p) => {
                const isLow = (p.stock_pieces ?? 0) <= (p.low_stock_threshold ?? 5)
                const costDisplay = getPriceDisplay(p, 'cost')
                const sellDisplay = getPriceDisplay(p, 'sell')
                const primaryBarcode = p.barcodes?.find((entry) => entry.is_primary)?.barcode || p.barcode
                return (
                    <div key={p.id} className="flex flex-col gap-2 p-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-medium text-slate-900">{p.name}</h4>
                                {p.category_nodes && <span className="text-xs text-slate-500 mr-2">{p.category_nodes.name}</span>}
                                {isLow && <Badge variant="destructive" className="text-[10px] h-5 px-1">Low Stock</Badge>}
                            </div>
                            <div className="flex rounded-lg bg-slate-100/70">
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
                                <span className="text-xs text-slate-500 block">Cost</span>
                                {costDisplay.primary !== null ? (
                                    <div className="leading-tight">
                                        <span className="font-semibold text-slate-900">{formatMoney(costDisplay.primary)}</span>
                                        {costDisplay.secondaryUnit !== null && (
                                            <span className="text-[11px] text-slate-500 block">{formatMoney(costDisplay.secondaryUnit)}/unit</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs text-slate-400">Not set</span>
                                )}
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block">Price</span>
                                {sellDisplay.primary !== null ? (
                                    <div className="leading-tight">
                                        <span className="font-semibold text-slate-900">{formatMoney(sellDisplay.primary)}</span>
                                        {sellDisplay.secondaryUnit !== null && (
                                            <span className="text-[11px] text-slate-500 block">{formatMoney(sellDisplay.secondaryUnit)}/unit</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs text-slate-400">Not set</span>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-sm">
                            <div>
                                <span className="text-xs text-slate-500 block">Stock</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`font-medium ${isLow ? 'text-red-600' : ''}`}>{p.stock_pieces} units</span>
                                    {p.stock_locked && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 leading-none bg-amber-50 text-amber-600 border-amber-200">Locked</Badge>}
                                </div>
                            </div>
                        </div>
                        {p.sku && <div className="text-xs text-slate-400 font-mono">SKU: {p.sku}</div>}
                        {primaryBarcode && <div className="text-xs text-slate-400 font-mono">Barcode: {primaryBarcode}</div>}
                    </div>
                )
            })}
        </div>
    )
}

// ProductForm Component using useActionState
function ProductForm({ defaultValues, categories, categoryNodes, distributorId, type, onCancel, pendingScannedBarcode }: {
    defaultValues?: Product,
    categories: Category[],
    categoryNodes: CategoryNode[],
    distributorId: string,
    type: 'add' | 'edit',
    onCancel: () => void,
    pendingScannedBarcode?: string | null
}) {
    /**
     * STABILIZATION LOGIC & TEST PLAN (DEV-ONLY):
     * 1. Controlled State: All inputs use string-based state to allow smooth typing and prevent "0" resets.
     * 2. Stable Keys: Component is mounted with a unique ID key to prevent stale state overlaps.
     * 3. Init Once: Values are initialized only on mount. Background re-renders do not overwrite user input.
     * 4. Explicit Toggles: Mode conversions happen ONLY on explicit click, not in sensitive useEffects.
     * 
     * TEST CHECKLIST:
     * - [ ] Price Input: Clear field, type "1.23", change units_per_case. Value must stay "1.23".
     * - [ ] Toggle Mode: Set price "10", click "Per Case". Value must become "10 * units". Switch back: "10".
     * - [ ] Save Error: Simulate error. Values must NOT clear.
     */

    // --- Form State ---
    // Use fully controlled inputs with string state to prevent jumping/incorrect resets
    const [name, setName] = useState(defaultValues?.name || '')
    const [sku, setSku] = useState(defaultValues?.sku || '')
    const [barcodeDrafts, setBarcodeDrafts] = useState<BarcodeDraft[]>(
        () => buildInitialBarcodeDrafts(defaultValues, type === 'add' ? pendingScannedBarcode : null)
    )
    const [barcodeInput, setBarcodeInput] = useState('')
    const barcodeInputRef = useRef<HTMLInputElement>(null)
    const isEditMode = type === 'edit' && Boolean(defaultValues?.id)
    const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null)

    const scannerCatcherRef = useRef<HTMLInputElement>(null)
    const scannerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const scannerLastHandledRef = useRef<{ value: string; at: number }>({ value: '', at: 0 })
    const [barcodeScanOpen, setBarcodeScanOpen] = useState(false)
    const [barcodeScanMode, setBarcodeScanMode] = useState<'scanner' | 'camera'>('scanner')
    const [barcodeScanStatus, setBarcodeScanStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
    const [barcodeScanMessage, setBarcodeScanMessage] = useState('Ready to scan a barcode.')
    const [barcodeScanLastCode, setBarcodeScanLastCode] = useState<string | null>(null)
    const [barcodeScanSaving, setBarcodeScanSaving] = useState(false)

    const [barcodeCameraOpen, setBarcodeCameraOpen] = useState(false)
    const [barcodeCameraError, setBarcodeCameraError] = useState<string | null>(null)
    const barcodeCameraStreamRef = useRef<MediaStream | null>(null)
    const [barcodeCameraStream, setBarcodeCameraStream] = useState<MediaStream | null>(null)

    const [lowStockThreshold, setLowStockThreshold] = useState(String(defaultValues?.low_stock_threshold ?? 5))
    const normalizedBarcodeEntries = useMemo(() => normalizeBarcodeDrafts(barcodeDrafts), [barcodeDrafts])
    const primaryBarcode = normalizedBarcodeEntries.find((entry) => entry.isPrimary)?.barcode ?? null

    const [allowCase, setAllowCase] = useState(defaultValues?.allow_case ?? false)
    const [allowPiece, setAllowPiece] = useState(defaultValues?.allow_piece ?? true)

    // Lock Stock Fields
    const [stockLocked, setStockLocked] = useState(defaultValues?.stock_locked ?? false)
    const [lockedStockQty, setLockedStockQty] = useState<string>(defaultValues?.locked_stock_qty != null ? String(defaultValues.locked_stock_qty) : '')

    // Units per Case (Central to calculations) - String state to allow smooth typing
    const [unitsPerCaseInput, setUnitsPerCaseInput] = useState<string>(String(defaultValues?.units_per_case ?? 1))
    const safeUnitsPerCaseValue = safeUnitsPerCase(unitsPerCaseInput)
    const hasValidUnitsPerCase = safeUnitsPerCaseValue !== null
    const unitsPerCase = safeUnitsPerCaseValue ?? 1

    // Subcategory logic
    const [selectedCategory, setSelectedCategory] = useState(String(defaultValues?.category_id ?? ''))
    const [selectedSubcategory, setSelectedSubcategory] = useState(String(defaultValues?.category_node_id ?? ''))
    const [subcategoryCacheByCategory, setSubcategoryCacheByCategory] = useState<Record<string, CategoryNode[]>>(() => {
        const initialCategoryId = String(defaultValues?.category_id ?? '').trim()
        if (!initialCategoryId) return {}
        return {
            [initialCategoryId]: filterCategoryNodesForCategory(categoryNodes, initialCategoryId) as CategoryNode[],
        }
    })
    const [subcategoryNotice, setSubcategoryNotice] = useState<string | null>(null)
    const [subcategoryWarning, setSubcategoryWarning] = useState<string | null>(null)
    const [subcategoryLoadError, setSubcategoryLoadError] = useState<string | null>(null)
    const [clientFormError, setClientFormError] = useState<string | null>(null)
    const hasInitialCategoryOptions = filterCategoryNodesForCategory(categoryNodes, String(defaultValues?.category_id ?? '')).length > 0
    const [isSubcategoryLoading, setIsSubcategoryLoading] = useState(Boolean(defaultValues?.category_id) && !hasInitialCategoryOptions)
    const latestSubcategoryFetchRef = useRef(0)
    const fetchedSubcategoryCategoriesRef = useRef<Set<string>>(new Set())
    const supabase = useMemo(() => createClient(), [])

    const initialUnitsPerCase = safeUnitsPerCase(defaultValues?.units_per_case)
    const initialCostMode: 'unit' | 'case' =
        defaultValues?.cost_mode === 'case' && initialUnitsPerCase !== null ? 'case' : 'unit'
    const initialPriceMode: 'unit' | 'case' =
        defaultValues?.price_mode === 'case' && initialUnitsPerCase !== null ? 'case' : 'unit'

    const initialCostResolved = resolveCaseUnitPrices({
        casePrice: defaultValues?.cost_per_case ?? defaultValues?.cost_case,
        unitPrice: defaultValues?.cost_per_unit ?? defaultValues?.cost_price,
        unitsPerCase: defaultValues?.units_per_case
    })
    const initialSellResolved = resolveCaseUnitPrices({
        casePrice: defaultValues?.sell_per_case ?? defaultValues?.price_case,
        unitPrice: defaultValues?.sell_per_unit ?? defaultValues?.sell_price,
        unitsPerCase: defaultValues?.units_per_case
    })

    const initialCostVal = initialCostMode === 'case' ? initialCostResolved.casePrice : initialCostResolved.unitPrice
    const initialSellVal = initialPriceMode === 'case' ? initialSellResolved.casePrice : initialSellResolved.unitPrice

    // Pricing Modes
    const [costMode, setCostMode] = useState<'unit' | 'case'>(initialCostMode)
    const [priceMode, setPriceMode] = useState<'unit' | 'case'>(initialPriceMode)
    const [costInput, setCostInput] = useState<string>(initialCostVal != null ? String(initialCostVal) : '')
    const [sellInput, setSellInput] = useState<string>(initialSellVal != null ? String(initialSellVal) : '')

    // Stock Logic
    const [stockMode, setStockMode] = useState<'pieces' | 'cases'>(defaultValues?.stock_mode || 'pieces')
    // Derive initial stock input based on mode
    const initialCanonicalStock = defaultValues?.stock_pieces || defaultValues?.stock_qty || 0
    const initialStockInput = useMemo(() => {
        if (defaultValues?.stock_mode === 'cases' && (defaultValues.units_per_case ?? 0) > 1) {
            return String(initialCanonicalStock / (defaultValues.units_per_case ?? 1))
        }
        return String(initialCanonicalStock)
    }, [defaultValues])

    const [stockInput, setStockInput] = useState<string>(initialStockInput)

    const addBarcodeDraft = useCallback((rawBarcode: string, makePrimary = false) => {
        const normalized = normalizeBarcode(rawBarcode)
        if (!normalized) return

        setBarcodeDrafts((prev) => {
            const existing = prev.find((entry) => normalizeBarcode(entry.value) === normalized)
            if (existing) {
                if (!makePrimary) return prev
                return prev.map((entry) => ({
                    ...entry,
                    isPrimary: entry.id === existing.id
                }))
            }

            const next = makePrimary
                ? prev.map((entry) => ({ ...entry, isPrimary: false }))
                : [...prev]

            next.push(createBarcodeDraft(normalized, makePrimary || next.length === 0))
            if (!next.some((entry) => entry.isPrimary) && next.length > 0) {
                next[0] = { ...next[0], isPrimary: true }
            }
            return next
        })
    }, [])

    const removeBarcodeDraft = useCallback((id: string) => {
        setBarcodeDrafts((prev) => {
            const next = prev.filter((entry) => entry.id !== id)
            if (next.length === 0) return next
            if (next.some((entry) => entry.isPrimary)) return next
            return next.map((entry, idx) => ({ ...entry, isPrimary: idx === 0 }))
        })
    }, [])

    const setPrimaryBarcodeDraft = useCallback((id: string) => {
        setBarcodeDrafts((prev) => prev.map((entry) => ({ ...entry, isPrimary: entry.id === id })))
    }, [])

    const copyBarcodeValue = useCallback(async (value: string) => {
        const normalized = normalizeBarcode(value)
        if (!normalized) return
        try {
            await navigator.clipboard.writeText(normalized)
            setCopiedBarcode(normalized)
            setTimeout(() => {
                setCopiedBarcode((prev) => prev === normalized ? null : prev)
            }, 1500)
        } catch {
            setClientFormError('Failed to copy barcode to clipboard.')
        }
    }, [])

    const clearScannerIdleTimer = useCallback(() => {
        if (scannerIdleTimerRef.current) {
            clearTimeout(scannerIdleTimerRef.current)
            scannerIdleTimerRef.current = null
        }
    }, [])

    const focusScannerCatcher = useCallback(() => {
        setTimeout(() => {
            scannerCatcherRef.current?.focus()
            scannerCatcherRef.current?.select()
        }, 60)
    }, [])

    const stopBarcodeCameraStream = useCallback(() => {
        if (barcodeCameraStreamRef.current) {
            barcodeCameraStreamRef.current.getTracks().forEach((track) => track.stop())
            barcodeCameraStreamRef.current = null
        }
        setBarcodeCameraStream(null)
    }, [])

    const closeBarcodeCamera = useCallback(() => {
        stopBarcodeCameraStream()
        setBarcodeCameraError(null)
        setBarcodeCameraOpen(false)
    }, [stopBarcodeCameraStream])

    const openBarcodeCamera = useCallback(async () => {
        setBarcodeCameraError(null)
        stopBarcodeCameraStream()
        setBarcodeScanMode('camera')
        setBarcodeScanStatus('idle')
        setBarcodeScanMessage('Starting camera…')
        setBarcodeCameraOpen(true)

        if (typeof window !== 'undefined' && !window.isSecureContext) {
            setBarcodeCameraError('insecure_context: Camera requires HTTPS or localhost.')
            setBarcodeScanStatus('error')
            setBarcodeScanMessage('Camera requires HTTPS or localhost.')
            return
        }

        if (!navigator?.mediaDevices?.getUserMedia) {
            setBarcodeCameraError('Camera not supported in this browser.')
            setBarcodeScanStatus('error')
            setBarcodeScanMessage('Camera is not supported in this browser.')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            })
            barcodeCameraStreamRef.current = stream
            setBarcodeCameraStream(stream)
            setBarcodeScanMessage('Camera active. Point at a barcode.')
        } catch {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                barcodeCameraStreamRef.current = stream
                setBarcodeCameraStream(stream)
                setBarcodeScanMessage('Camera active. Point at a barcode.')
            } catch (fallbackError: any) {
                setBarcodeCameraError(`${fallbackError?.name || 'CameraError'}: ${fallbackError?.message || 'Unable to access camera.'}`)
                setBarcodeScanStatus('error')
                setBarcodeScanMessage('Unable to access camera.')
            }
        }
    }, [stopBarcodeCameraStream])

    const closeBarcodeScanModal = useCallback(() => {
        clearScannerIdleTimer()
        closeBarcodeCamera()
        setBarcodeScanOpen(false)
        setBarcodeScanMode('scanner')
        setBarcodeScanStatus('idle')
        setBarcodeScanMessage('Ready to scan a barcode.')
        setBarcodeScanSaving(false)
    }, [clearScannerIdleTimer, closeBarcodeCamera])

    const openBarcodeScanModal = useCallback(() => {
        setBarcodeScanOpen(true)
        setBarcodeScanMode('scanner')
        setBarcodeScanStatus('idle')
        setBarcodeScanMessage('Scanner mode active. Scan a barcode now.')
        setBarcodeScanLastCode(null)
        setBarcodeScanSaving(false)
        focusScannerCatcher()
    }, [focusScannerCatcher])

    const handleScannedBarcode = useCallback(async (rawBarcode: string) => {
        const normalized = normalizeBarcode(rawBarcode)
        const now = Date.now()

        if (
            normalized
            && scannerLastHandledRef.current.value === normalized
            && now - scannerLastHandledRef.current.at < 1200
        ) {
            return
        }

        scannerLastHandledRef.current = {
            value: normalized,
            at: now
        }

        setBarcodeScanLastCode(normalized || rawBarcode.trim())

        if (!normalized || normalized.length < 6) {
            setBarcodeScanStatus('error')
            setBarcodeScanMessage('Invalid barcode. Minimum length is 6.')
            if (barcodeScanMode === 'scanner') focusScannerCatcher()
            return
        }

        const alreadyInDraft = barcodeDrafts.some((entry) => normalizeBarcode(entry.value) === normalized)
        if (alreadyInDraft) {
            setBarcodeScanStatus('success')
            setBarcodeScanMessage('Already added to this product.')
            if (barcodeScanMode === 'scanner') focusScannerCatcher()
            return
        }

        if (isEditMode && defaultValues?.id) {
            setBarcodeScanSaving(true)
            setBarcodeScanStatus('saving')
            setBarcodeScanMessage(`Saving ${normalized}…`)

            const result = await addBarcodeToProduct({
                productId: defaultValues.id,
                barcode: normalized
            })

            setBarcodeScanSaving(false)

            if (!result.success) {
                setBarcodeScanStatus('error')
                setBarcodeScanMessage(result.error || 'Failed to save barcode.')
                if (barcodeScanMode === 'scanner') focusScannerCatcher()
                return
            }

            addBarcodeDraft(result.barcode || normalized)
            setBarcodeScanStatus('success')
            setBarcodeScanMessage(
                result.alreadyAdded
                    ? 'Already added to this product.'
                    : 'Barcode added and saved.'
            )
            if (barcodeScanMode === 'scanner') focusScannerCatcher()
            return
        }

        addBarcodeDraft(normalized)
        setBarcodeScanStatus('success')
        setBarcodeScanMessage('Barcode queued. Save product to persist.')
        if (barcodeScanMode === 'scanner') focusScannerCatcher()
    }, [barcodeDrafts, barcodeScanMode, addBarcodeDraft, defaultValues?.id, focusScannerCatcher, isEditMode])

    const commitScannerInput = useCallback(() => {
        clearScannerIdleTimer()
        const scannerInput = scannerCatcherRef.current
        if (!scannerInput) return

        const scannedValue = scannerInput.value.trim()
        if (!scannedValue) return

        scannerInput.value = ''
        void handleScannedBarcode(scannedValue)
    }, [clearScannerIdleTimer, handleScannedBarcode])

    const queueScannerCommit = useCallback(() => {
        clearScannerIdleTimer()
        scannerIdleTimerRef.current = setTimeout(() => {
            commitScannerInput()
        }, 140)
    }, [clearScannerIdleTimer, commitScannerInput])

    const applyScannedBarcode = useCallback((rawBarcode: string) => {
        addBarcodeDraft(rawBarcode, true)
        setTimeout(() => {
            barcodeInputRef.current?.focus()
        }, 0)
    }, [addBarcodeDraft])

    useEffect(() => {
        if (pendingScannedBarcode && type === 'add') {
            applyScannedBarcode(pendingScannedBarcode)
        }
    }, [pendingScannedBarcode, type, applyScannedBarcode])

    useEffect(() => {
        if (!barcodeScanOpen || barcodeScanMode !== 'scanner') return
        focusScannerCatcher()
    }, [barcodeScanMode, barcodeScanOpen, focusScannerCatcher])

    useEffect(() => {
        return () => {
            clearScannerIdleTimer()
            stopBarcodeCameraStream()
        }
    }, [clearScannerIdleTimer, stopBarcodeCameraStream])

    // --- Explicit Handlers to prevent async side-effect overwrites ---
    const parsePriceInput = (rawValue: string): number | null => {
        if (rawValue.trim() === '') return null
        const parsed = Number(rawValue)
        return Number.isFinite(parsed) ? parsed : null
    }

    useEffect(() => {
        if (!hasValidUnitsPerCase) {
            if (costMode === 'case') setCostMode('unit')
            if (priceMode === 'case') setPriceMode('unit')
        }
    }, [costMode, hasValidUnitsPerCase, priceMode])

    const handlePriceModeToggle = (target: 'cost' | 'price', newMode: 'unit' | 'case') => {
        if (newMode === 'case' && !hasValidUnitsPerCase) {
            setClientFormError('Set units per case to use case pricing.')
            return
        }

        if (target === 'cost') {
            const currentVal = parsePriceInput(costInput)
            if (currentVal !== null && costMode !== newMode) {
                const converted = newMode === 'case'
                    ? toCaseFromUnit(currentVal, safeUnitsPerCaseValue)
                    : toUnitFromCase(currentVal, safeUnitsPerCaseValue)
                if (converted !== null) setCostInput(String(converted))
            }
            setCostMode(newMode)
            setClientFormError(null)
        } else {
            const currentVal = parsePriceInput(sellInput)
            if (currentVal !== null && priceMode !== newMode) {
                const converted = newMode === 'case'
                    ? toCaseFromUnit(currentVal, safeUnitsPerCaseValue)
                    : toUnitFromCase(currentVal, safeUnitsPerCaseValue)
                if (converted !== null) setSellInput(String(converted))
            }
            setPriceMode(newMode)
            setClientFormError(null)
        }
    }

    const handleStockModeToggle = (newMode: 'pieces' | 'cases') => {
        const val = Number(stockInput)
        if (!isNaN(val) && stockMode !== newMode) {
            if (newMode === 'cases') {
                // Pieces -> Cases
                setStockInput(String(val / unitsPerCase))
            } else {
                // Cases -> Pieces
                setStockInput(String(val * unitsPerCase))
            }
        }
        setStockMode(newMode)
    }

    // Calculation Helpers
    const getCostPerUnit = () => {
        const val = parsePriceInput(costInput)
        if (val === null) return null
        if (costMode === 'unit') return val
        return toUnitFromCase(val, safeUnitsPerCaseValue)
    }

    const getSellPerUnit = () => {
        const val = parsePriceInput(sellInput)
        if (val === null) return null
        if (priceMode === 'unit') return val
        return toUnitFromCase(val, safeUnitsPerCaseValue)
    }

    const getCostPerCase = () => {
        const val = parsePriceInput(costInput)
        if (val === null) return null
        if (costMode === 'case') return val
        return toCaseFromUnit(val, safeUnitsPerCaseValue)
    }

    const getSellPerCase = () => {
        const val = parsePriceInput(sellInput)
        if (val === null) return null
        if (priceMode === 'case') return val
        return toCaseFromUnit(val, safeUnitsPerCaseValue)
    }

    const costPerUnit = getCostPerUnit()
    const sellPerUnit = getSellPerUnit()
    const costPerCase = getCostPerCase()
    const sellPerCase = getSellPerCase()

    const availableSubcategories = useMemo(() => {
        if (!selectedCategory) return []
        const cached = subcategoryCacheByCategory[selectedCategory] ?? []
        const fallback = filterCategoryNodesForCategory(categoryNodes, selectedCategory) as CategoryNode[]
        const source = cached.length > 0 ? cached : fallback

        // Defensive filter: keep options scoped even if stale or overly broad rows ever leak in.
        return filterCategoryNodesForCategory(source, selectedCategory) as CategoryNode[]
    }, [categoryNodes, selectedCategory, subcategoryCacheByCategory])

    const knownSubcategoriesById = useMemo(() => {
        const map = new Map<string, CategoryNode>()
        for (const node of categoryNodes) {
            map.set(node.id, node)
        }
        for (const nodes of Object.values(subcategoryCacheByCategory)) {
            for (const node of nodes) {
                map.set(node.id, node)
            }
        }
        return map
    }, [categoryNodes, subcategoryCacheByCategory])

    useEffect(() => {
        if (!selectedCategory) {
            setIsSubcategoryLoading(false)
            setSubcategoryLoadError(null)
            return
        }

        if (fetchedSubcategoryCategoriesRef.current.has(selectedCategory)) {
            return
        }

        let active = true
        const requestId = ++latestSubcategoryFetchRef.current
        const hasCachedEntries = (subcategoryCacheByCategory[selectedCategory]?.length ?? 0) > 0
        if (!hasCachedEntries) {
            setIsSubcategoryLoading(true)
        }
        setSubcategoryLoadError(null)

        void (async () => {
            const { data, error } = await supabase
                .from('category_nodes')
                .select('id,name,category_id')
                .eq('distributor_id', distributorId)
                .eq('category_id', selectedCategory)
                .order('name', { ascending: true })

            if (!active || requestId !== latestSubcategoryFetchRef.current) {
                return
            }

            setIsSubcategoryLoading(false)

            if (error) {
                setSubcategoryLoadError('Unable to load sub-categories right now.')
                if (process.env.NODE_ENV !== 'production') {
                    console.error('[Inventory] Failed to fetch sub-categories', {
                        selectedCategory,
                        error,
                    })
                }
                return
            }

            const scoped = filterCategoryNodesForCategory((data ?? []) as CategoryNode[], selectedCategory) as CategoryNode[]
            setSubcategoryCacheByCategory(prev => ({
                ...prev,
                [selectedCategory]: scoped,
            }))
            fetchedSubcategoryCategoriesRef.current.add(selectedCategory)
        })()

        return () => {
            active = false
        }
    }, [distributorId, selectedCategory, subcategoryCacheByCategory, supabase])

    useEffect(() => {
        if (!selectedSubcategory) return
        if (!selectedCategory) {
            setSelectedSubcategory('')
            if (type === 'edit') {
                setSubcategoryWarning('Saved sub-category no longer matches a selected category. Please re-select.')
            } else {
                setSubcategoryNotice('Sub-category cleared because category changed.')
            }
            return
        }
        if (isSubcategoryLoading) return

        const stillValid = availableSubcategories.some(node => node.id === selectedSubcategory)
        if (stillValid) return

        setSelectedSubcategory('')
        if (type === 'edit') {
            setSubcategoryWarning('Saved sub-category no longer belongs to the selected category. Please re-select.')
        } else {
            setSubcategoryNotice('Sub-category cleared because category changed.')
        }
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[Inventory] Cleared invalid sub-category selection', {
                selectedCategory,
                selectedSubcategory,
                type,
            })
        }
    }, [availableSubcategories, isSubcategoryLoading, selectedCategory, selectedSubcategory, type])

    const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVal = e.target.value
        if (newVal === selectedCategory) return

        setSelectedCategory(newVal)
        setClientFormError(null)
        setSubcategoryLoadError(null)
        setSubcategoryWarning(null)

        if (!selectedSubcategory) {
            setSubcategoryNotice(null)
            return
        }

        const selectedNode = knownSubcategoriesById.get(selectedSubcategory)
        const stillMatches = isCategoryNodeInCategory(selectedNode, newVal)
        if (!stillMatches) {
            setSelectedSubcategory('')
            setSubcategoryNotice('Sub-category cleared because category changed.')
            return
        }

        setSubcategoryNotice(null)
    }

    const handleSubcategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedSubcategory(e.target.value)
        setClientFormError(null)
        setSubcategoryNotice(null)
        setSubcategoryWarning(null)
    }

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        setClientFormError(null)

        const invalidDraft = barcodeDrafts.find((entry) => {
            const raw = String(entry.value || '').trim()
            if (!raw) return false
            const normalized = normalizeBarcode(raw)
            return normalized.length > 0 && normalized.length < 6
        })
        if (invalidDraft) {
            e.preventDefault()
            setClientFormError(`Barcode "${invalidDraft.value}" is too short. Minimum length is 6.`)
            return
        }

        if ((costMode === 'case' || priceMode === 'case') && !hasValidUnitsPerCase) {
            e.preventDefault()
            setClientFormError('Set units per case to use case pricing.')
            return
        }

        if (costPerUnit === null || sellPerUnit === null) {
            e.preventDefault()
            setClientFormError('Enter valid numeric prices before saving.')
            return
        }

        if (
            costPerUnit < 0 ||
            sellPerUnit < 0 ||
            (costPerCase !== null && costPerCase < 0) ||
            (sellPerCase !== null && sellPerCase < 0)
        ) {
            e.preventDefault()
            setClientFormError('Prices must be 0 or greater.')
            return
        }

        if (!selectedSubcategory) return

        if (!selectedCategory) {
            e.preventDefault()
            setClientFormError('Select a category before selecting a sub-category.')
            return
        }

        const selectedNode = availableSubcategories.find(node => node.id === selectedSubcategory)
        const isValid = isCategoryNodeInCategory(selectedNode, selectedCategory)
        if (!isValid) {
            e.preventDefault()
            setClientFormError('Selected sub-category does not belong to the selected category.')
        }
    }

    const serverAction = type === 'edit' ? updateProductAction : createProductAction
    const [state, formAction] = useActionState(serverAction, { success: false, error: null })

    useEffect(() => {
        if (state.success) {
            onCancel()
        }
    }, [state.success, onCancel])

    return (
        <form action={formAction} onSubmit={handleSubmit} className="space-y-4 p-5">
            {(clientFormError || state.error) && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {clientFormError || state.error}
                </div>
            )}

            {type === 'edit' && <input type="hidden" name="id" value={defaultValues?.id || ''} />}

            {/* Hidden fields to pass canonical values and modes to server */}
            <input type="hidden" name="cost_mode" value={costMode} />
            <input type="hidden" name="price_mode" value={priceMode} />
            {/* We will send the calculated UNIT prices as the standard fields, 
                and also the CASE prices as extra fields. 
                Ideally, the server should validate, but we can compute here for convenience.
            */}
            <input type="hidden" name="cost_price" value={costPerUnit ?? ''} />
            <input type="hidden" name="sell_price" value={sellPerUnit ?? ''} />
            <input type="hidden" name="cost_case" value={costPerCase ?? ''} />
            <input type="hidden" name="price_case" value={sellPerCase ?? ''} />
            <input type="hidden" name="barcode" value={primaryBarcode ?? ''} />
            <input type="hidden" name="barcodes_json" value={JSON.stringify(normalizedBarcodeEntries)} />


            <div className="grid gap-2">
                <label className="text-sm font-medium">Name</label>
                <Input name="name" value={name} onChange={e => setName(e.target.value)} required placeholder="Product Name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <label className="text-sm font-medium">SKU</label>
                    <Input name="sku" value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU-123" />
                </div>
                <div className="col-span-2 grid gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-medium">Barcodes</label>
                        <span className="text-xs text-slate-500">Primary barcode stays synced to legacy field</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Input
                            ref={barcodeInputRef}
                            value={barcodeInput}
                            onChange={(e) => setBarcodeInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return
                                e.preventDefault()
                                addBarcodeDraft(barcodeInput)
                                setBarcodeInput('')
                            }}
                            placeholder="Add barcode (UPC/EAN/alias)"
                            className="min-w-[220px] flex-1"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                addBarcodeDraft(barcodeInput)
                                setBarcodeInput('')
                                barcodeInputRef.current?.focus()
                            }}
                        >
                            Add Typed
                        </Button>
                        <Button
                            type="button"
                            onClick={openBarcodeScanModal}
                        >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add
                        </Button>
                    </div>

                    {barcodeDrafts.length === 0 ? (
                        <p className="text-xs text-slate-500">No barcodes yet. Add one to support scan lookup aliases.</p>
                    ) : (
                        <div className="space-y-2">
                            {barcodeDrafts.map((entry) => {
                                const normalized = normalizeBarcode(entry.value)
                                const isTooShort = normalized.length > 0 && normalized.length < 6
                                return (
                                    <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2">
                                        <button
                                            type="button"
                                            onClick={() => setPrimaryBarcodeDraft(entry.id)}
                                            className={`rounded-md px-2 py-1 text-xs font-medium ${entry.isPrimary ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {entry.isPrimary ? 'Primary' : 'Set Primary'}
                                        </button>
                                        <Input
                                            value={entry.value}
                                            onChange={(e) => {
                                                const next = e.target.value
                                                setBarcodeDrafts((prev) => prev.map((row) => row.id === entry.id ? { ...row, value: next } : row))
                                            }}
                                            className="min-w-[180px] flex-1 font-mono text-xs"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyBarcodeValue(entry.value)}
                                            className="px-2"
                                        >
                                            {copiedBarcode === normalizeBarcode(entry.value) ? (
                                                <Check className="h-4 w-4 text-emerald-600" />
                                            ) : (
                                                <Copy className="h-4 w-4 text-slate-500" />
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                            onClick={() => removeBarcodeDraft(entry.id)}
                                        >
                                            Remove
                                        </Button>
                                        {isTooShort && (
                                            <span className="text-[11px] font-medium text-amber-700">Min 6 chars</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                {/* Category & Subcategory */}
                <div className="flex flex-col gap-2 col-span-2 sm:col-span-1">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Category</label>
                        <select
                            name="category_id"
                            value={selectedCategory}
                            onChange={handleCategoryChange}
                            className="form-select"
                        >
                            <option value="">Uncategorized</option>
                            {categories.map((c) => (
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
                    onChange={handleSubcategoryChange}
                    disabled={!selectedCategory || isSubcategoryLoading}
                    className="form-select disabled:bg-slate-100/80"
                >
                    <option value="">
                        {!selectedCategory
                            ? 'Select a category first'
                            : isSubcategoryLoading
                                ? 'Loading subcategories...'
                                : availableSubcategories.length === 0
                                    ? 'No subcategories available'
                                    : 'Select Subcategory (Optional)'}
                    </option>
                    {availableSubcategories.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                {!selectedCategory && (
                    <p className="text-xs text-slate-500">Select a category first.</p>
                )}
                {subcategoryNotice && (
                    <p className="text-xs text-amber-700">{subcategoryNotice}</p>
                )}
                {subcategoryWarning && (
                    <p className="text-xs font-medium text-amber-700">{subcategoryWarning}</p>
                )}
                {subcategoryLoadError && (
                    <p className="text-xs text-red-600">{subcategoryLoadError}</p>
                )}
            </div>

            {/* Ordering Configuration */}
            <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                <p className="text-sm font-medium text-slate-700">Ordering Configuration</p>
                <div className="grid gap-2">
                    <label className="text-sm font-medium">Units Per Case (Case Pack Size)</label>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            name="units_per_case"
                            value={unitsPerCaseInput}
                            onChange={(e) => setUnitsPerCaseInput(e.target.value)}
                            min="1"
                            required
                            className="w-full"
                        />
                        <span className="text-xs text-slate-500 whitespace-nowrap">items/case</span>
                    </div>
                    <p className="text-xs text-slate-500">
                        This is the pack size for 1 case. Value <strong>1</strong> is valid for case-only ordering.
                    </p>
                </div>
                <div className="flex gap-6 pt-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="allow_piece" checked={allowPiece} onChange={e => setAllowPiece(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40" />
                        Allow Units
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" name="allow_case" checked={allowCase} onChange={e => setAllowCase(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40" />
                        Allow Cases
                    </label>
                </div>
            </div>

            {/* Pricing Section with Toggles */}
            <div className="space-y-4 pt-2">
                <h4 className="text-sm font-semibold text-slate-900">Pricing</h4>

                {/* Cost Price */}
                <div className="grid gap-2 rounded-xl border border-slate-200/80 bg-white/75 p-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Cost Price</label>
                        <div className="flex rounded-lg bg-slate-100 p-0.5">
                            <button
                                type="button"
                                onClick={() => handlePriceModeToggle('cost', 'unit')}
                                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${costMode === 'unit' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Per Unit
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePriceModeToggle('cost', 'case')}
                                disabled={!hasValidUnitsPerCase}
                                title={!hasValidUnitsPerCase ? 'Set units per case to use case pricing' : undefined}
                                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${costMode === 'case' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${!hasValidUnitsPerCase ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                                Per Case
                            </button>
                        </div>
                    </div>
                    {!hasValidUnitsPerCase && (
                        <p className="text-xs text-amber-700">Set units per case to use case pricing.</p>
                    )}
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                        <Input
                            value={costInput}
                            onChange={e => setCostInput(e.target.value)}
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder="0.00"
                            className="pl-7"
                        />
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
                        <div className="text-sm font-semibold text-slate-900">
                            {costPerCase === null ? 'Not set /case' : `${formatMoney(costPerCase)}/case`}
                        </div>
                        <div className="text-xs text-slate-500">
                            {costPerUnit === null ? 'Not set /unit' : `${formatMoney(costPerUnit)}/unit`}
                        </div>
                    </div>
                </div>

                {/* Sell Price */}
                <div className="grid gap-2 rounded-xl border border-slate-200/80 bg-white/75 p-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Sell Price</label>
                        <div className="flex rounded-lg bg-slate-100 p-0.5">
                            <button
                                type="button"
                                onClick={() => handlePriceModeToggle('price', 'unit')}
                                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${priceMode === 'unit' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Per Unit
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePriceModeToggle('price', 'case')}
                                disabled={!hasValidUnitsPerCase}
                                title={!hasValidUnitsPerCase ? 'Set units per case to use case pricing' : undefined}
                                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${priceMode === 'case' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${!hasValidUnitsPerCase ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                                Per Case
                            </button>
                        </div>
                    </div>
                    {!hasValidUnitsPerCase && (
                        <p className="text-xs text-amber-700">Set units per case to use case pricing.</p>
                    )}
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                        <Input
                            value={sellInput}
                            onChange={e => setSellInput(e.target.value)}
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder="0.00"
                            className="pl-7"
                        />
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
                        <div className="text-sm font-semibold text-slate-900">
                            {sellPerCase === null ? 'Not set /case' : `${formatMoney(sellPerCase)}/case`}
                        </div>
                        <div className="text-xs text-slate-500">
                            {sellPerUnit === null ? 'Not set /unit' : `${formatMoney(sellPerUnit)}/unit`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stock Section with Mode Toggle */}
            <div className="relative grid gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">

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
                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            value="true"
                        />
                        Lock Stock Quantity
                    </label>
                    {stockLocked && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 pointer-events-none">Locked</Badge>}
                </div>

                {stockLocked && (
                    <div className="mb-2 grid gap-1 rounded-lg border border-amber-100 bg-white p-3 shadow-sm">
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
                    <label className="text-sm font-medium">Current Stock (Inventory Units)</label>
                    <div className="flex rounded-lg bg-slate-200 p-0.5">
                        <button
                            type="button"
                            onClick={() => handleStockModeToggle('pieces')}
                            className={`rounded-md px-2 py-0.5 text-xs transition-colors ${stockMode === 'pieces' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Pieces (Units)
                        </button>
                        <button
                            type="button"
                            onClick={() => handleStockModeToggle('cases')}
                            className={`rounded-md px-2 py-0.5 text-xs transition-colors ${stockMode === 'cases' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
                <Input
                    name="low_stock_threshold"
                    type="number"
                    value={lowStockThreshold}
                    onChange={e => setLowStockThreshold(e.target.value)}
                />
            </div>

            {/* Hidden fields for Stock */}
            <input type="hidden" name="stock_mode" value={stockMode} />
            {/* Canonical stock_qty (Legacy/Standard) is always UNITS */}
            <input
                type="hidden"
                name="stock_qty"
                value={stockMode === 'cases' ? Number(stockInput || 0) * unitsPerCase : Number(stockInput || 0)}
            />

            <BarcodeScanModal
                open={barcodeScanOpen}
                onClose={closeBarcodeScanModal}
                title="Add Barcode"
                description={
                    isEditMode
                        ? 'Scanned barcodes save immediately to this product.'
                        : 'Scanned barcodes are queued and saved when you create the product.'
                }
                maxWidthClassName="max-w-xl"
            >
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant={barcodeScanMode === 'scanner' ? 'default' : 'outline'}
                            onClick={() => {
                                closeBarcodeCamera()
                                setBarcodeScanMode('scanner')
                                setBarcodeScanStatus('idle')
                                setBarcodeScanMessage('Scanner mode active. Scan a barcode now.')
                                focusScannerCatcher()
                            }}
                        >
                            Scanner ON
                        </Button>
                        <Button
                            type="button"
                            variant={barcodeScanMode === 'camera' ? 'default' : 'outline'}
                            onClick={() => {
                                void openBarcodeCamera()
                            }}
                        >
                            Use Camera
                        </Button>
                        <Button type="button" variant="outline" onClick={closeBarcodeScanModal}>
                            Stop
                        </Button>
                    </div>

                    <div
                        className={`rounded-lg border px-3 py-2 text-xs ${
                            barcodeScanStatus === 'error'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : barcodeScanStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : barcodeScanStatus === 'saving'
                                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                    >
                        <p className="font-medium">{barcodeScanMessage}</p>
                        {barcodeScanLastCode && (
                            <p className="mt-1 font-mono text-[11px]">Last scanned: {barcodeScanLastCode}</p>
                        )}
                    </div>

                    {barcodeScanMode === 'scanner' && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-xs text-slate-600">
                                Keep this modal open and scan with your wireless scanner.
                            </p>
                            <input
                                ref={scannerCatcherRef}
                                type="text"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                inputMode="none"
                                tabIndex={-1}
                                className="sr-only"
                                aria-label="Scanner catcher input"
                                onInput={() => {
                                    if (!barcodeScanSaving) {
                                        setBarcodeScanStatus('idle')
                                        setBarcodeScanMessage('Receiving scanner input…')
                                    }
                                    queueScannerCommit()
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                        e.preventDefault()
                                        commitScannerInput()
                                    }
                                }}
                                onBlur={() => {
                                    if (barcodeScanOpen && barcodeScanMode === 'scanner') {
                                        focusScannerCatcher()
                                    }
                                }}
                            />
                            <div className="mt-2 flex justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={focusScannerCatcher}
                                >
                                    Refocus Scanner
                                </Button>
                            </div>
                        </div>
                    )}

                    {barcodeScanMode === 'camera' && (
                        <p className="text-xs text-slate-600">
                            Camera scanner opens above this modal. Close the camera view to return here.
                        </p>
                    )}
                </div>
            </BarcodeScanModal>

            <CameraBarcodeScannerModal
                open={barcodeCameraOpen}
                stream={barcodeCameraStream}
                cameraError={barcodeCameraError}
                onClose={closeBarcodeCamera}
                onUseManualInput={() => {
                    closeBarcodeCamera()
                    setBarcodeScanMode('scanner')
                    setBarcodeScanStatus('idle')
                    setBarcodeScanMessage('Scanner mode active. Scan a barcode now.')
                    focusScannerCatcher()
                }}
                onScan={(scannedBarcode: string) => {
                    closeBarcodeCamera()
                    void handleScannedBarcode(scannedBarcode)
                }}
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
