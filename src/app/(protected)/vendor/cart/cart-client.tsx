'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    ArrowLeft,
    Trash2,
    ShoppingCart,
    AlertTriangle,
    X,
    Save,
    Clock3
} from 'lucide-react'
import { formatPriceLabel, formatQtyLabel, computeLineTotal } from '@/lib/pricing-engine'
import { MAX_VENDOR_NOTE_LENGTH } from '@/lib/orders/vendor-note'
import {
    normalizeCartItems,
    readCartItemsFromStorage,
    writeCartItemsToStorage
} from '@/lib/vendor/cart-storage'
import { normalizeDraftCartPayload } from '@/lib/vendor/drafts'
import type { CartStorageItem } from '@/lib/vendor/reorder'

type CartItem = CartStorageItem

type Banner = {
    type: 'error' | 'warning' | 'success'
    message: string
    removedNames?: string[]
}

type DraftSummary = {
    id: string
    name: string | null
    distributor_id: string
    updated_at: string
    cart_payload: { items: CartItem[] }
}

type DraftStatus = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_INTERVAL_MS = 30_000
const CHANGE_DEBOUNCE_MS = 2_500
const MIN_WRITE_INTERVAL_MS = 5_000

function formatDraftTimestamp(iso: string | null): string {
    if (!iso) return 'Never'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Unknown'
    return d.toLocaleString()
}

export function CartClient({
    distributorId,
    initialResumeDraftId
}: {
    distributorId: string
    initialResumeDraftId?: string | null
}) {
    const [items, setItems] = useState<CartItem[]>([])
    const [loading, setLoading] = useState(false)
    const [banner, setBanner] = useState<Banner | null>(null)
    const [vendorNote, setVendorNote] = useState('')
    const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle')
    const [draftStatusMessage, setDraftStatusMessage] = useState('Autosave ready')
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
    const [saveDraftOpen, setSaveDraftOpen] = useState(false)
    const [resumeDraftOpen, setResumeDraftOpen] = useState(false)
    const [draftNameInput, setDraftNameInput] = useState('')
    const [drafts, setDrafts] = useState<DraftSummary[]>([])
    const [loadingDrafts, setLoadingDrafts] = useState(false)
    const [draftActionLoadingId, setDraftActionLoadingId] = useState<string | null>(null)

    const itemsRef = useRef<CartItem[]>([])
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const autosaveInFlightRef = useRef(false)
    const lastAutosaveAtRef = useRef<number>(0)
    const hydratedRef = useRef(false)
    const resumedFromQueryRef = useRef(false)

    const total = useMemo(() => items.reduce((s, i) => {
        const isCase = i.order_unit === 'case'
        const selectedPrice = isCase
            ? (i.case_price_snapshot && i.case_price_snapshot > 0 ? i.case_price_snapshot : Number(i.unit_price || 0))
            : (i.unit_price_snapshot && i.unit_price_snapshot > 0 ? i.unit_price_snapshot : Number(i.unit_price || 0))
        return s + computeLineTotal(Number(i.qty), selectedPrice)
    }, 0), [items])

    const autosaveDraft = useMemo(
        () => drafts.find((d) => !d.name),
        [drafts]
    )

    const setSavedCart = useCallback((next: CartItem[]) => {
        const normalized = normalizeCartItems(next)
        const withContext = normalized.map((line) => ({ ...line, distributor_id: distributorId }))
        const saved = writeCartItemsToStorage(distributorId, withContext)
        setItems(saved)
        itemsRef.current = saved
    }, [distributorId])

    const loadCartFromStorage = useCallback(() => {
        const stored = readCartItemsFromStorage(distributorId)
        setItems(stored)
        itemsRef.current = stored
    }, [distributorId])

    function getSelectedPrice(item: CartItem): number {
        const isCase = item.order_unit === 'case'
        if (isCase && item.case_price_snapshot && item.case_price_snapshot > 0) return item.case_price_snapshot
        if (!isCase && item.unit_price_snapshot && item.unit_price_snapshot > 0) return item.unit_price_snapshot
        return Number(item.unit_price || 0)
    }

    const persistDraft = useCallback(async (mode: 'autosave' | 'named', name?: string) => {
        const currentItems = itemsRef.current
        if (!distributorId || currentItems.length === 0) return null

        setDraftStatus('saving')
        setDraftStatusMessage('Saving draft...')

        const response = await fetch('/api/vendor/drafts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                mode,
                distributorId,
                name: name?.trim() || null,
                subtotalSnapshot: total,
                cartPayload: { items: currentItems },
                currency: 'usd'
            })
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
            setDraftStatus('error')
            setDraftStatusMessage(payload?.error || 'Could not autosave')
            return null
        }

        const updatedAt = String(payload?.draft?.updated_at || new Date().toISOString())
        setLastSavedAt(updatedAt)
        setDraftStatus('saved')
        setDraftStatusMessage('Saved')
        if (mode === 'named') {
            setBanner({ type: 'success', message: `Draft "${payload?.draft?.name || name || 'Saved'}" saved.` })
        }
        return payload?.draft || null
    }, [distributorId, total])

    const runAutosave = useCallback(async (reason: 'change' | 'interval' | 'manual') => {
        if (!distributorId) return
        if (autosaveInFlightRef.current) return
        if (itemsRef.current.length === 0) return

        const now = Date.now()
        if (reason !== 'manual' && now - lastAutosaveAtRef.current < MIN_WRITE_INTERVAL_MS) return

        autosaveInFlightRef.current = true
        try {
            const savedDraft = await persistDraft('autosave')
            if (savedDraft) {
                lastAutosaveAtRef.current = Date.now()
            }
        } finally {
            autosaveInFlightRef.current = false
        }
    }, [distributorId, persistDraft])

    const queueChangeAutosave = useCallback(() => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
        const elapsed = Date.now() - lastAutosaveAtRef.current
        const minDelay = Math.max(0, MIN_WRITE_INTERVAL_MS - elapsed)
        const delay = Math.max(CHANGE_DEBOUNCE_MS, minDelay)
        autosaveTimerRef.current = setTimeout(() => {
            void runAutosave('change')
        }, delay)
    }, [runAutosave])

    const fetchDrafts = useCallback(async () => {
        if (!distributorId) return
        setLoadingDrafts(true)
        try {
            const response = await fetch(`/api/vendor/drafts?distributorId=${encodeURIComponent(distributorId)}`, {
                method: 'GET',
                cache: 'no-store'
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load drafts')
            }
            const rows = Array.isArray(payload?.drafts) ? payload.drafts : []
            setDrafts(rows)
            const latestAutosave = rows.find((row: any) => !row?.name)
            if (latestAutosave?.updated_at) {
                setLastSavedAt(String(latestAutosave.updated_at))
            }
        } catch (error: any) {
            setDraftStatus('error')
            setDraftStatusMessage(error?.message || 'Failed to load drafts')
        } finally {
            setLoadingDrafts(false)
        }
    }, [distributorId])

    const loadDraftById = useCallback(async (draftId: string, showBanner = true) => {
        if (!draftId) return
        setDraftActionLoadingId(draftId)
        try {
            const response = await fetch(`/api/vendor/drafts/${encodeURIComponent(draftId)}`, {
                method: 'GET',
                cache: 'no-store'
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load draft')
            }

            const draftPayload = normalizeDraftCartPayload(payload?.draft?.cart_payload)
            const next = draftPayload.items.map((line) => ({ ...line, distributor_id: distributorId }))
            setSavedCart(next)
            setResumeDraftOpen(false)
            setLastSavedAt(String(payload?.draft?.updated_at || new Date().toISOString()))
            setDraftStatus('saved')
            setDraftStatusMessage('Draft restored')
            if (showBanner) {
                setBanner({
                    type: 'success',
                    message: `Loaded draft ${payload?.draft?.name ? `"${payload.draft.name}"` : '(autosave)'}.`
                })
            }
        } catch (error: any) {
            setBanner({
                type: 'error',
                message: error?.message || 'Failed to load draft'
            })
        } finally {
            setDraftActionLoadingId(null)
        }
    }, [distributorId, setSavedCart])

    const deleteDraftById = useCallback(async (draftId: string) => {
        if (!draftId) return
        setDraftActionLoadingId(draftId)
        try {
            const response = await fetch(`/api/vendor/drafts/${encodeURIComponent(draftId)}`, {
                method: 'DELETE'
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to delete draft')
            }
            setDrafts((prev) => prev.filter((d) => d.id !== draftId))
        } catch (error: any) {
            setBanner({
                type: 'error',
                message: error?.message || 'Failed to delete draft'
            })
        } finally {
            setDraftActionLoadingId(null)
        }
    }, [])

    useEffect(() => {
        if (!distributorId) return
        loadCartFromStorage()
        void fetchDrafts()
    }, [distributorId, fetchDrafts, loadCartFromStorage])

    useEffect(() => {
        if (!distributorId) return
        if (!hydratedRef.current) {
            hydratedRef.current = true
            return
        }

        itemsRef.current = items
        if (items.length === 0) return
        queueChangeAutosave()
    }, [distributorId, items, queueChangeAutosave])

    useEffect(() => {
        if (!distributorId) return
        if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current)
        autosaveIntervalRef.current = setInterval(() => {
            void runAutosave('interval')
        }, AUTOSAVE_INTERVAL_MS)
        return () => {
            if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current)
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
        }
    }, [distributorId, runAutosave])

    useEffect(() => {
        if (!initialResumeDraftId || resumedFromQueryRef.current) return
        resumedFromQueryRef.current = true
        void loadDraftById(initialResumeDraftId, false)
    }, [initialResumeDraftId, loadDraftById])

    function save(next: CartItem[]) {
        setSavedCart(next)
    }

    function inc(id: string, unit: string) {
        save(items.map((i) => (i.product_id === id && i.order_unit === unit ? { ...i, qty: i.qty + 1 } : i)))
    }

    function dec(id: string, unit: string) {
        save(items
            .map((i) => (i.product_id === id && i.order_unit === unit ? { ...i, qty: Math.max(1, i.qty - 1) } : i))
        )
    }

    function remove(id: string, unit: string) {
        save(items.filter((i) => !(i.product_id === id && i.order_unit === unit)))
    }

    async function saveNamedDraft() {
        const trimmedName = draftNameInput.trim()
        if (items.length === 0) {
            setBanner({ type: 'warning', message: 'Your cart is empty. Add items before saving a draft.' })
            return
        }
        const draft = await persistDraft(trimmedName ? 'named' : 'autosave', trimmedName)
        if (draft) {
            setSaveDraftOpen(false)
            setDraftNameInput('')
            await fetchDrafts()
        }
    }

    async function placeOrder() {
        if (!distributorId) return
        setLoading(true)
        setBanner(null)
        try {
            const res = await fetch('/api/vendor/place-order', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    distributorId,
                    vendor_note: vendorNote,
                    items: items.map((i) => ({
                        product_id: i.product_id,
                        qty: i.qty,
                        order_unit: i.order_unit
                    }))
                })
            })
            const json = await res.json()

            if (!res.ok) {
                if (json.invalidItems && Array.isArray(json.invalidItems)) {
                    const invalidSet = new Set(json.invalidItems as string[])
                    const removedNames = items
                        .filter((i) => invalidSet.has(i.product_id))
                        .map((i) => i.name)
                    const remaining = items.filter((i) => !invalidSet.has(i.product_id))

                    save(remaining)

                    setBanner({
                        type: 'warning',
                        message: remaining.length > 0
                            ? 'Some items were removed because they are no longer available. You can place your order with the remaining items.'
                            : 'All items in your cart are no longer available and have been removed.',
                        removedNames
                    })

                    if (remaining.length > 0 && json.shouldRetry) {
                        setTimeout(() => placeOrder(), 500)
                    }
                    return
                }

                throw new Error(json?.error || 'Failed to place order')
            }

            writeCartItemsToStorage(distributorId, [])
            window.location.href = `/vendor/orders/${json.order_id}`
        } catch (e: any) {
            setBanner({
                type: 'error',
                message: e.message || 'Something went wrong. Please try again.'
            })
        } finally {
            setLoading(false)
        }
    }

    if (!distributorId) {
        return <div className="p-8 text-center text-slate-500">Loading cart context...</div>
    }

    return (
        <div className="flex min-h-[100dvh] flex-col gap-6 md:min-h-0">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Shopping Cart</h1>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        {draftStatus === 'saving' ? 'Saving...' : draftStatusMessage}
                        {lastSavedAt && <span>• Last saved {formatDraftTimestamp(lastSavedAt)}</span>}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSaveDraftOpen(true)}>
                        <Save className="mr-2 h-4 w-4" />
                        Save Draft
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setResumeDraftOpen(true)
                            void fetchDrafts()
                        }}
                    >
                        Resume Draft
                    </Button>
                    <Link href="/vendor/catalog">
                        <Button variant="ghost" size="sm" className="pl-0">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="border-slate-200 bg-slate-50/70">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-700">Drafts for this distributor</p>
                        <p className="text-xs text-slate-500">
                            Autosaves every 30 seconds and after cart changes.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void runAutosave('manual')} disabled={items.length === 0}>
                            Save Now
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                            setResumeDraftOpen(true)
                            void fetchDrafts()
                        }}>
                            Open Drafts ({drafts.length})
                        </Button>
                        {autosaveDraft && (
                            <Button
                                size="sm"
                                onClick={() => void loadDraftById(autosaveDraft.id)}
                                disabled={draftActionLoadingId === autosaveDraft.id}
                            >
                                Continue Autosave
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {banner && (
                <div className={`relative rounded-lg border px-4 py-3 ${banner.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : banner.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-green-50 border-green-200 text-green-800'
                    }`}>
                    <button
                        className="absolute top-3 right-3 p-0.5 rounded hover:bg-black/5"
                        onClick={() => setBanner(null)}
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <div className="flex items-start gap-2 pr-6">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-sm">{banner.message}</p>
                            {banner.removedNames && banner.removedNames.length > 0 && (
                                <ul className="mt-1 text-xs space-y-0.5 list-disc list-inside opacity-80">
                                    {banner.removedNames.map((name, idx) => (
                                        <li key={idx}>{name}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-3">
                <div className="md:col-span-2">
                    <div className="flex min-h-0 flex-col">
                        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+12rem)] pr-1 [-webkit-overflow-scrolling:touch] md:overflow-visible md:pb-0 md:pr-0">
                            {items.length ? (
                                items.map((i, idx) => {
                                    const isCase = i.order_unit === 'case'
                                    const selectedPrice = getSelectedPrice(i)
                                    const lineTotal = computeLineTotal(i.qty, selectedPrice)
                                    const perUnitReference = isCase && i.case_price_snapshot && (i.units_per_case ?? 0) > 0
                                        ? (i.case_price_snapshot / Number(i.units_per_case || 1))
                                        : null

                                    return (
                                        <Card key={`${i.product_id}-${i.order_unit}-${idx}`}>
                                            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="font-semibold text-lg flex items-center gap-2">
                                                        {i.name}
                                                        <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 uppercase">
                                                            {i.order_unit}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-slate-500">
                                                        {formatPriceLabel(selectedPrice, i.order_unit)}
                                                        {isCase && (i.units_per_case ?? 0) > 0 && (
                                                            <span className="ml-2 text-xs opacity-70">
                                                                ({i.units_per_case} units/case
                                                                {perUnitReference ? ` • $${perUnitReference.toFixed(2)}/unit` : ''})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end mt-2 sm:mt-0">
                                                    <div className="flex items-center rounded-md border border-slate-200">
                                                        <button className="h-10 w-10 flex items-center justify-center hover:bg-slate-50 text-lg" onClick={() => dec(i.product_id, i.order_unit)}>-</button>
                                                        <div className="w-16 text-center font-medium">{formatQtyLabel(i.qty, i.order_unit)}</div>
                                                        <button className="h-10 w-10 flex items-center justify-center hover:bg-slate-50 text-lg" onClick={() => inc(i.product_id, i.order_unit)}>+</button>
                                                    </div>
                                                    <div className="text-right min-w-[80px] font-medium text-lg">
                                                        ${lineTotal.toFixed(2)}
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => remove(i.product_id, i.order_unit)}>
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                })
                            ) : (
                                <Card className="border-dashed">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                        <ShoppingCart className="h-12 w-12 text-slate-300 mb-4" />
                                        <h3 className="text-lg font-medium text-slate-900">Your cart is empty</h3>
                                        <p className="text-slate-500 mt-1 mb-6">Looks like you haven&apos;t added anything to your cart yet.</p>
                                        <Link href="/vendor/catalog">
                                            <Button>Browse Catalog</Button>
                                        </Link>
                                    </CardContent>
                                </Card>
                            )}

                            <Card className="md:hidden">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Note for distributor (optional)</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 p-4 pt-0">
                                    <textarea
                                        id="vendor-note-mobile"
                                        value={vendorNote}
                                        onChange={(e) => setVendorNote(e.target.value)}
                                        maxLength={MAX_VENDOR_NOTE_LENGTH}
                                        rows={3}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-primary/20"
                                        placeholder="Visible in order details only."
                                    />
                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                        <span>Not shown on invoice.</span>
                                        <span>{vendorNote.length}/{MAX_VENDOR_NOTE_LENGTH}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>

                <div className="hidden md:block md:col-span-1">
                    <Card className="sticky top-24">
                        <CardHeader>
                            <CardTitle>Order Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Subtotal</span>
                                <span className="font-medium">${total.toFixed(2)}</span>
                            </div>
                            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-base font-bold">Total</span>
                                <span className="text-xl font-bold">${total.toFixed(2)}</span>
                            </div>
                            <div className="space-y-2 border-t border-slate-100 pt-4">
                                <label htmlFor="vendor-note-desktop" className="text-sm font-medium text-slate-700">
                                    Note for distributor (optional)
                                </label>
                                <textarea
                                    id="vendor-note-desktop"
                                    value={vendorNote}
                                    onChange={(e) => setVendorNote(e.target.value)}
                                    maxLength={MAX_VENDOR_NOTE_LENGTH}
                                    rows={4}
                                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-primary/20"
                                    placeholder="Add delivery instructions, special handling, or other context."
                                />
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                    <span>Visible to distributor in order details. Not shown on invoice.</span>
                                    <span>{vendorNote.length}/{MAX_VENDOR_NOTE_LENGTH}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex-col gap-3">
                            <Button className="w-full" size="lg" disabled={items.length === 0 || loading} onClick={placeOrder}>
                                {loading ? 'Processing...' : 'Place Order'}
                            </Button>
                            <p className="text-xs text-center text-slate-500">
                                Payment due upon invoice creation.
                            </p>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 border-t border-white/70 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-10px_24px_-20px_rgba(15,23,42,0.8)] backdrop-blur-xl md:hidden">
                <div className="mx-auto w-full max-w-7xl">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">Total</span>
                        <span className="text-xl font-bold text-slate-900">${total.toFixed(2)}</span>
                    </div>
                    <Button className="h-12 w-full text-lg" disabled={items.length === 0 || loading} onClick={placeOrder}>
                        {loading ? 'Processing...' : 'Place Order'}
                    </Button>
                </div>
            </div>

            {saveDraftOpen && (
                <div className="fixed inset-0 z-[90] bg-black/50 p-4 backdrop-blur-sm">
                    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/70 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 className="text-base font-semibold text-slate-900">Save Draft</h3>
                            <Button variant="ghost" size="icon" onClick={() => setSaveDraftOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="space-y-3 p-4">
                            <label className="block text-sm font-medium text-slate-700">
                                Draft name (optional)
                            </label>
                            <input
                                type="text"
                                value={draftNameInput}
                                onChange={(e) => setDraftNameInput(e.target.value)}
                                maxLength={120}
                                placeholder="e.g. Friday Restock"
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                            />
                            <p className="text-xs text-slate-500">
                                Leave empty to update your autosave draft.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <Button variant="outline" onClick={() => setSaveDraftOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={() => void saveNamedDraft()} disabled={draftStatus === 'saving' || items.length === 0}>
                                {draftStatus === 'saving' ? 'Saving...' : 'Save Draft'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {resumeDraftOpen && (
                <div className="fixed inset-0 z-[90] bg-black/50 p-4 backdrop-blur-sm">
                    <div className="mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/70 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 className="text-base font-semibold text-slate-900">Resume Draft</h3>
                            <Button variant="ghost" size="icon" onClick={() => setResumeDraftOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-1 space-y-3 overflow-y-auto p-4">
                            {loadingDrafts ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                    Loading drafts...
                                </div>
                            ) : drafts.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                    No drafts saved for this distributor yet.
                                </div>
                            ) : (
                                drafts.map((draft) => {
                                    const itemCount = draft.cart_payload?.items?.length ?? 0
                                    const isBusy = draftActionLoadingId === draft.id
                                    return (
                                        <div key={draft.id} className="rounded-lg border border-slate-200 p-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        {draft.name || 'Autosave Draft'}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {itemCount} item lines • Updated {formatDraftTimestamp(draft.updated_at)}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void deleteDraftById(draft.id)}
                                                        disabled={isBusy}
                                                    >
                                                        Delete
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => void loadDraftById(draft.id)}
                                                        disabled={isBusy}
                                                    >
                                                        {isBusy ? 'Loading...' : 'Load Draft'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

