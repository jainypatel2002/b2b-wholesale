'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanLine, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CameraBarcodeScannerModal } from '@/components/scanner/CameraBarcodeScannerModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { normalizeBarcode } from '@/lib/utils/barcode'
import {
    addProductToVendorCart
} from '@/lib/vendor/cart-storage'
import type { CartOrderUnit } from '@/lib/vendor/reorder'
import { switchDistributor } from '@/app/(protected)/vendor/actions'
import { useRouter } from 'next/navigation'

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

type LinkedDistributorSuggestion = {
    distributorId: string
    distributorName: string
    matches: BarcodeMatch[]
}

const SCAN_CATCHER_ID = 'vendor-catalog-scan-catcher'

interface CatalogScanControlProps {
    distributorId: string
    compactOnMobile?: boolean
    className?: string
    onBarcodeNotFoundSearch?: (barcode: string) => void
}

export function CatalogScanControl({
    distributorId,
    compactOnMobile = false,
    className = '',
    onBarcodeNotFoundSearch
}: CatalogScanControlProps) {
    const [scanOpen, setScanOpen] = useState(false)
    const [scanMode, setScanMode] = useState(false)
    const [scanStatus, setScanStatus] = useState<ScannerStatus>('idle')
    const [scanStatusMessage, setScanStatusMessage] = useState('')
    const [lastScannedCode, setLastScannedCode] = useState('')
    const [lastAddedProductName, setLastAddedProductName] = useState('')
    const [scanMatches, setScanMatches] = useState<BarcodeMatch[]>([])
    const [linkedSuggestion, setLinkedSuggestion] = useState<LinkedDistributorSuggestion | null>(null)
    const [switchingDistributor, setSwitchingDistributor] = useState(false)
    const [cameraOpen, setCameraOpen] = useState(false)
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
    const [cameraError, setCameraError] = useState<string | null>(null)

    const scanInputRef = useRef<HTMLInputElement>(null)
    const scanLockUntilRef = useRef<number>(0)
    const cameraStreamRef = useRef<MediaStream | null>(null)
    const router = useRouter()

    const openScanModal = useCallback(() => {
        setScanOpen(true)
        setScanMode(true)
        setScanStatus('ready')
        setScanStatusMessage('Ready for scanner input')
        setLastAddedProductName('')
        setLinkedSuggestion(null)
    }, [])

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

    const closeScanModal = useCallback(() => {
        closeCamera()
        setScanOpen(false)
        setScanMode(false)
        setScanStatus('idle')
        setScanStatusMessage('')
        setLastAddedProductName('')
        setScanMatches([])
        setLinkedSuggestion(null)
    }, [closeCamera])

    const addScannedProductToCart = useCallback((
        match: BarcodeMatch,
        requestedUnit?: CartOrderUnit,
        targetDistributorId?: string
    ) => {
        const effectiveDistributorId = targetDistributorId || distributorId
        const result = addProductToVendorCart({
            distributorId: effectiveDistributorId,
            product: match,
            requestedUnit,
            qty: 1
        })
        if (!result.ok) {
            if (result.reason === 'invalid_distributor') {
                toast.error('No distributor context found. Please refresh.')
                return false
            }

            if (result.reason === 'unit_not_allowed') {
                toast.error(`${match.name} cannot be ordered by ${requestedUnit === 'case' ? 'case' : 'unit'}`)
                return false
            }

            if (result.reason === 'price_unavailable') {
                toast.error(`Price is not available for ${match.name}`)
                return false
            }

            toast.error(`Could not add ${match.name}. Please try again.`)
            return false
        }

        setLastAddedProductName(match.name)
        toast.success(`Added: ${match.name}`)
        return true
    }, [distributorId])

    const handleBarcodeDetected = useCallback(async (rawCode: string) => {
        const barcode = normalizeBarcode(rawCode)
        if (!barcode || barcode.length < 6) return

        const now = Date.now()
        if (now < scanLockUntilRef.current) return
        scanLockUntilRef.current = now + 800

        setLastScannedCode(barcode)
        setLastAddedProductName('')
        setScanMatches([])
        setLinkedSuggestion(null)
        setScanStatus('searching')
        setScanStatusMessage(`Looking up ${barcode}...`)

        try {
            const response = await fetch(
                `/api/vendor/catalog/barcode?distributorId=${encodeURIComponent(distributorId)}&barcode=${encodeURIComponent(barcode)}&searchLinked=1`,
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
            const suggestion = payload?.linkedSuggestion && typeof payload.linkedSuggestion === 'object'
                ? payload.linkedSuggestion as LinkedDistributorSuggestion
                : null
            setScanMatches(matches)
            setLinkedSuggestion(suggestion)

            if (matches.length === 0) {
                setScanStatus('not_found')
                setScanStatusMessage(
                    suggestion
                        ? `Not found in this catalog. Available under ${suggestion.distributorName}.`
                        : 'Not found in this distributor catalog'
                )
                return
            }

            if (matches.length === 1) {
                const added = addScannedProductToCart(matches[0])
                setScanStatus(added ? 'found' : 'error')
                setScanStatusMessage(added ? `Added: ${matches[0].name}` : `Could not add ${matches[0].name} to cart`)
                return
            }

            setScanStatus('found')
            setScanStatusMessage(`Found ${matches.length} products. Select one to add.`)
        } catch (error: any) {
            setScanStatus('error')
            setScanStatusMessage(error?.message || 'Lookup failed')
        }
    }, [addScannedProductToCart, distributorId])

    const handleSwitchDistributorAndRetry = useCallback(async () => {
        if (!linkedSuggestion) return

        setSwitchingDistributor(true)
        try {
            const switched = await switchDistributor(linkedSuggestion.distributorId)
            if (!switched?.success) {
                toast.error(switched?.message || 'Failed to switch distributor')
                return
            }

            let added = false
            const firstMatch = linkedSuggestion.matches[0]
            if (firstMatch) {
                added = addScannedProductToCart(firstMatch, undefined, linkedSuggestion.distributorId)
            }

            if (added && firstMatch) {
                setScanStatus('found')
                setScanStatusMessage(`Switched to ${linkedSuggestion.distributorName} and added ${firstMatch.name}`)
            } else {
                setScanStatus('ready')
                setScanStatusMessage(`Switched to ${linkedSuggestion.distributorName}. Scan again to retry.`)
            }

            setLinkedSuggestion(null)
            setScanMatches([])
            router.refresh()
        } catch (error) {
            console.error('Failed to switch distributor from scanner', error)
            toast.error('Failed to switch distributor')
        } finally {
            setSwitchingDistributor(false)
        }
    }, [addScannedProductToCart, linkedSuggestion, router])

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

    useEffect(() => {
        return () => {
            if (!cameraStreamRef.current) return
            cameraStreamRef.current.getTracks().forEach((track) => track.stop())
            cameraStreamRef.current = null
        }
    }, [])

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

    return (
        <>
            <Button
                type="button"
                variant="outline"
                onClick={openScanModal}
                className={`${compactOnMobile ? 'h-9 w-9 px-0 sm:w-auto sm:px-3' : ''} ${className}`.trim()}
                aria-label="Scan barcode"
            >
                <ScanLine className={compactOnMobile ? 'h-4 w-4 sm:mr-2' : 'mr-2 h-4 w-4'} />
                <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Scan</span>
            </Button>

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
                                {lastAddedProductName && (
                                    <div className="mt-3">
                                        <Link href="/vendor/cart" onClick={closeScanModal}>
                                            <Button type="button" size="sm" variant="outline">
                                                Go to cart
                                            </Button>
                                        </Link>
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
                                                            onClick={() => {
                                                                const added = addScannedProductToCart(match, 'piece')
                                                                if (!added) return
                                                                setScanStatus('found')
                                                                setScanStatusMessage(`Added: ${match.name}`)
                                                            }}
                                                        >
                                                            + Unit
                                                        </Button>
                                                    )}
                                                    {match.allow_case && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                const added = addScannedProductToCart(match, 'case')
                                                                if (!added) return
                                                                setScanStatus('found')
                                                                setScanStatusMessage(`Added: ${match.name}`)
                                                            }}
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
                                    <p className="text-sm font-medium">Not found in this distributor catalog.</p>
                                    {linkedSuggestion && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="mt-2 mr-2"
                                            disabled={switchingDistributor}
                                            onClick={handleSwitchDistributorAndRetry}
                                        >
                                            {switchingDistributor ? 'Switching...' : `Switch to ${linkedSuggestion.distributorName} and retry`}
                                        </Button>
                                    )}
                                    {onBarcodeNotFoundSearch && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="mt-2"
                                            onClick={() => {
                                                onBarcodeNotFoundSearch(lastScannedCode)
                                                closeScanModal()
                                            }}
                                        >
                                            Search catalog
                                        </Button>
                                    )}
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
        </>
    )
}
