'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ShoppingCart, ArrowLeft, Star, X, ScanLine, Zap } from 'lucide-react'
import { ProductCard } from '@/components/vendor/product-card'
import { toast } from 'sonner'
import { usePathname, useSearchParams } from 'next/navigation'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { CameraBarcodeScannerModal } from '@/components/scanner/CameraBarcodeScannerModal'
import { sanitizeBarcode } from '@/lib/utils/barcode'
import {
    addOrIncrementProductInCart,
    readCartItemsFromStorage,
    writeCartItemsToStorage
} from '@/lib/vendor/cart-storage'
import type { CartStorageItem, CartOrderUnit } from '@/lib/vendor/reorder'

interface CategoryProductsClientProps {
    products: any[]
    categoryName: string
    subcategories: any[]
    distributorId: string
    favoritesOnly: boolean
    initialFavoriteProductIds: string[]
}

type ScannerStatus = 'idle' | 'ready' | 'searching' | 'found' | 'not_found' | 'error' | 'camera_active'

type BarcodeMatch = {
    id: string
    name: string
    sku?: string | null
    allow_piece: boolean
    allow_case: boolean
    units_per_case: number
    sell_per_unit: number | null
    sell_per_case: number | null
    override_unit_price: number | null
    override_case_price: number | null
}

const SCAN_CATCHER_ID = 'vendor-barcode-scan-catcher'

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
    const [cartItems, setCartItems] = useState<CartStorageItem[]>([])
    const [quickAddMode, setQuickAddMode] = useState(false)
    const [scanOpen, setScanOpen] = useState(false)
    const [scanMode, setScanMode] = useState(false)
    const [scanStatus, setScanStatus] = useState<ScannerStatus>('idle')
    const [scanStatusMessage, setScanStatusMessage] = useState('')
    const [lastScannedCode, setLastScannedCode] = useState('')
    const [scanMatches, setScanMatches] = useState<BarcodeMatch[]>([])
    const [cameraOpen, setCameraOpen] = useState(false)
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
    const [cameraError, setCameraError] = useState<string | null>(null)

    const pathname = usePathname()
    const searchParams = useSearchParams()
    const scanInputRef = useRef<HTMLInputElement>(null)
    const scanLockUntilRef = useRef<number>(0)
    const cartRef = useRef<CartStorageItem[]>([])
    const cameraStreamRef = useRef<MediaStream | null>(null)

    const quickAddStorageKey = useMemo(
        () => `dv_quick_add_${distributorId}`,
        [distributorId]
    )

    useEffect(() => {
        cartRef.current = cartItems
    }, [cartItems])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const persisted = window.localStorage.getItem(quickAddStorageKey)
        setQuickAddMode(persisted === '1')
    }, [quickAddStorageKey])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const refresh = () => {
            const next = readCartItemsFromStorage(distributorId)
            setCartItems(next)
        }
        refresh()
        window.addEventListener('cart-updated', refresh)
        window.addEventListener('storage', refresh)
        return () => {
            window.removeEventListener('cart-updated', refresh)
            window.removeEventListener('storage', refresh)
        }
    }, [distributorId])

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

    const closeCamera = useCallback(() => {
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach((track) => track.stop())
            cameraStreamRef.current = null
        }
        setCameraStream(null)
        setCameraError(null)
        setCameraOpen(false)
        if (scanOpen && scanMode) {
            setScanStatus('ready')
            setScanStatusMessage('')
        } else {
            setScanStatus('idle')
            setScanStatusMessage('')
        }
    }, [scanMode, scanOpen])

    const addScannedProductToCart = useCallback((match: BarcodeMatch, requestedUnit?: CartOrderUnit) => {
        const orderUnit: CartOrderUnit = requestedUnit
            ? requestedUnit
            : (match.allow_piece ? 'piece' : 'case')

        if (orderUnit === 'piece' && !match.allow_piece) {
            toast.error(`${match.name} cannot be ordered by unit`)
            return
        }
        if (orderUnit === 'case' && !match.allow_case) {
            toast.error(`${match.name} cannot be ordered by case`)
            return
        }

        const next = addOrIncrementProductInCart(cartRef.current, match, orderUnit, 1).map((line) => ({
            ...line,
            distributor_id: distributorId
        }))

        const saved = writeCartItemsToStorage(distributorId, next)
        setCartItems(saved)
        toast.success(`Added: ${match.name}`)
    }, [distributorId])

    const handleBarcodeDetected = useCallback(async (rawCode: string) => {
        const barcode = sanitizeBarcode(rawCode)
        if (!barcode) return

        const now = Date.now()
        if (now < scanLockUntilRef.current) return
        scanLockUntilRef.current = now + 800

        setLastScannedCode(barcode)
        setScanMatches([])
        setScanStatus('searching')
        setScanStatusMessage(`Looking up ${barcode}...`)

        try {
            const response = await fetch(
                `/api/vendor/catalog/barcode?distributorId=${encodeURIComponent(distributorId)}&barcode=${encodeURIComponent(barcode)}`,
                {
                    method: 'GET',
                    cache: 'no-store'
                }
            )
            const payload = await response.json().catch(() => ({}))

            if (!response.ok) {
                throw new Error(payload?.error || 'Lookup failed')
            }

            const matches = Array.isArray(payload?.matches) ? payload.matches as BarcodeMatch[] : []
            setScanMatches(matches)

            if (matches.length === 0) {
                setScanStatus('not_found')
                setScanStatusMessage('No product found for this barcode')
                return
            }

            if (matches.length === 1) {
                addScannedProductToCart(matches[0])
                setScanStatus('found')
                setScanStatusMessage(`Added: ${matches[0].name}`)
                return
            }

            setScanStatus('found')
            setScanStatusMessage(`Found ${matches.length} products. Select one to add.`)
        } catch (error: any) {
            setScanStatus('error')
            setScanStatusMessage(error?.message || 'Lookup failed')
        }
    }, [addScannedProductToCart, distributorId])

    const openCamera = useCallback(async () => {
        setCameraError(null)
        setCameraStream(null)
        setScanStatus('camera_active')
        setScanStatusMessage('Starting camera...')
        setCameraOpen(true)

        if (typeof window !== 'undefined' && !window.isSecureContext) {
            setCameraError('insecure_context: Camera requires HTTPS or localhost.')
            setScanStatus('error')
            setScanStatusMessage('Camera requires HTTPS or localhost')
            return
        }

        if (!navigator?.mediaDevices?.getUserMedia) {
            setCameraError('Camera not supported in this browser.')
            setScanStatus('error')
            setScanStatusMessage('Camera not supported')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            })
            cameraStreamRef.current = stream
            setCameraStream(stream)
            setScanStatus('camera_active')
            setScanStatusMessage('Camera active')
        } catch {
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                cameraStreamRef.current = fallbackStream
                setCameraStream(fallbackStream)
                setScanStatus('camera_active')
                setScanStatusMessage('Camera active')
            } catch (error: any) {
                setCameraError(`${error?.name || 'Error'}: ${error?.message || 'Camera unavailable'}`)
                setScanStatus('error')
                setScanStatusMessage('Failed to start camera')
            }
        }
    }, [])

    const closeScanModal = useCallback(() => {
        closeCamera()
        setScanOpen(false)
        setScanMode(false)
        setScanStatus('idle')
        setScanStatusMessage('')
        setScanMatches([])
    }, [closeCamera])

    useEffect(() => {
        if (!scanOpen || !scanMode) return
        const t = setTimeout(() => {
            scanInputRef.current?.focus()
            setScanStatus('ready')
            if (!scanStatusMessage) setScanStatusMessage('Ready for scanner input')
        }, 80)
        return () => clearTimeout(t)
    }, [scanMode, scanOpen, scanStatusMessage])

    useBarcodeScanner({
        enabled: scanOpen && scanMode,
        onScan: handleBarcodeDetected,
        scanCatcherInputId: SCAN_CATCHER_ID,
        dedupeMs: 800
    })

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

        const getPrimaryCasePrice = (product: any) => {
            const unitsPerCase = Math.max(1, Number(product.units_per_case || 1))
            const casePrice = Number(product.sell_per_case)
            if (Number.isFinite(casePrice)) return casePrice
            const unitPrice = Number(product.sell_per_unit)
            if (Number.isFinite(unitPrice)) return unitPrice * unitsPerCase
            return 0
        }

        if (favoritesOnly) {
            result = result.filter((p: any) => favoriteIds.has(p.id))
        }

        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase()
            result = result.filter((p: any) =>
                p.name.toLowerCase().includes(lower) ||
                p.subcategories?.name?.toLowerCase().includes(lower) ||
                (p.sku && p.sku.toLowerCase().includes(lower))
            )
        }

        if (selectedSubcategory !== 'all') {
            result = result.filter((p: any) => p.subcategories?.name === selectedSubcategory)
        }

        if (inStockOnly) {
            result = result.filter((p: any) => (p.stock_pieces > 0 || p.stock_qty > 0))
        }

        result = [...result].sort((a: any, b: any) => {
            switch (sortOrder) {
                case 'price_asc':
                    return getPrimaryCasePrice(a) - getPrimaryCasePrice(b)
                case 'price_desc':
                    return getPrimaryCasePrice(b) - getPrimaryCasePrice(a)
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
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button
                            type="button"
                            variant={quickAddMode ? 'secondary' : 'outline'}
                            className="w-full sm:w-auto"
                            onClick={() => {
                                setQuickAddMode((prev) => {
                                    const next = !prev
                                    if (typeof window !== 'undefined') {
                                        window.localStorage.setItem(quickAddStorageKey, next ? '1' : '0')
                                    }
                                    return next
                                })
                            }}
                        >
                            <Zap className="mr-2 h-4 w-4" />
                            Quick Add
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => {
                                setScanOpen(true)
                                setScanMode(true)
                                setScanStatus('ready')
                                setScanStatusMessage('Ready for scanner input')
                            }}
                        >
                            <ScanLine className="mr-2 h-4 w-4" />
                            Scan
                        </Button>
                        <Link href="/vendor/cart">
                            <Button variant="outline" className="w-full sm:w-auto relative">
                                <ShoppingCart className="mr-2 h-4 w-4" /> Cart
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100 items-start sm:items-center flex-wrap">
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

                <div className="text-xs text-slate-500 font-medium px-1">
                    Showing {filteredProducts.length} of {products.length} products
                    {favoritesOnly && <span className="ml-2 text-amber-700">Favorites only</span>}
                    {quickAddMode && <span className="ml-2 text-emerald-700">Quick Add enabled</span>}
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
                            quickAddMode={quickAddMode}
                            cartItems={cartItems}
                            onCartItemsChange={setCartItems}
                        />
                    ))}
                </div>
            )}

            {scanOpen && (
                <div className="fixed inset-0 z-[90] bg-black/50 p-4 backdrop-blur-sm">
                    <div className="mx-auto flex h-full w-full max-w-lg flex-col rounded-2xl border border-white/70 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900">Scan Barcode</h2>
                                <p className="text-xs text-slate-500">Scanner input or camera</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={closeScanModal}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="space-y-4 overflow-y-auto p-4">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant={scanMode ? 'secondary' : 'outline'}
                                    onClick={() => {
                                        setScanMode((prev) => {
                                            const next = !prev
                                            setScanStatus(next ? 'ready' : 'idle')
                                            setScanStatusMessage(next ? 'Ready for scanner input' : 'Scanner off')
                                            return next
                                        })
                                    }}
                                >
                                    <ScanLine className="mr-2 h-4 w-4" />
                                    {scanMode ? 'Scanner ON' : 'Scan Mode'}
                                </Button>
                                <Button type="button" variant="outline" onClick={openCamera}>
                                    Use Camera
                                </Button>
                                <Button type="button" variant="ghost" onClick={closeScanModal}>
                                    Stop
                                </Button>
                            </div>

                            {scanMode && (
                                <>
                                    <input
                                        ref={scanInputRef}
                                        id={SCAN_CATCHER_ID}
                                        type="text"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        className="sr-only"
                                        tabIndex={-1}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') e.preventDefault()
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => scanInputRef.current?.focus()}
                                    >
                                        Tap to focus scanner input
                                    </Button>
                                </>
                            )}

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
                                <div className="mt-1 text-sm text-slate-800">
                                    {scanStatusMessage || (scanStatus === 'idle' ? 'Scanner idle' : 'Ready')}
                                </div>
                                {lastScannedCode && (
                                    <div className="mt-2 text-xs text-slate-600">
                                        Last code: <span className="font-mono">{lastScannedCode}</span>
                                    </div>
                                )}
                            </div>

                            {scanMatches.length > 1 && (
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Multiple Matches
                                    </div>
                                    <div className="space-y-2">
                                        {scanMatches.map((match) => (
                                            <div key={match.id} className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900">{match.name}</p>
                                                    {match.sku && <p className="text-xs text-slate-500">SKU: {match.sku}</p>}
                                                </div>
                                                <div className="flex gap-1">
                                                    {match.allow_piece && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => addScannedProductToCart(match, 'piece')}
                                                        >
                                                            + Unit
                                                        </Button>
                                                    )}
                                                    {match.allow_case && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => addScannedProductToCart(match, 'case')}
                                                        >
                                                            + Case
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {scanStatus === 'not_found' && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                                    <p className="text-sm font-medium">No product found for this barcode.</p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="mt-2"
                                        onClick={() => {
                                            setSearchTerm(lastScannedCode)
                                            closeScanModal()
                                        }}
                                    >
                                        Search catalog
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <CameraBarcodeScannerModal
                open={cameraOpen}
                stream={cameraStream}
                cameraError={cameraError}
                onClose={closeCamera}
                onScan={(barcode: string) => {
                    closeCamera()
                    handleBarcodeDetected(barcode)
                }}
            />
        </div>
    )
}
