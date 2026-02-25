'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Trash2, ShoppingCart, AlertTriangle, X } from 'lucide-react'
import { formatPriceLabel, formatQtyLabel, computeLineTotal, OrderMode } from '@/lib/pricing-engine'
import { MAX_VENDOR_NOTE_LENGTH } from '@/lib/orders/vendor-note'

type CartItem = {
    product_id: string;
    name: string;
    unit_price: number;
    unit_price_snapshot?: number | null;
    case_price_snapshot?: number | null;
    qty: number;
    order_unit: OrderMode;
    units_per_case?: number;
}

type Banner = {
    type: 'error' | 'warning' | 'success';
    message: string;
    removedNames?: string[];
}

export function CartClient({ distributorId }: { distributorId: string }) {
    const [items, setItems] = useState<CartItem[]>([])
    const [loading, setLoading] = useState(false)
    const [banner, setBanner] = useState<Banner | null>(null)
    const [vendorNote, setVendorNote] = useState('')

    // Use scoped key
    const CART_KEY = `dv_cart_${distributorId}`

    function parsePrice(value: unknown): number | null {
        const n = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(n) || n <= 0) return null
        return n
    }

    function normalizeCartItem(raw: any): CartItem {
        const orderUnit: OrderMode = raw?.order_unit === 'case' ? 'case' : 'piece'
        const unitsPerCase = Math.max(1, Math.floor(Number(raw?.units_per_case || 1)))

        const legacySelectedPrice = parsePrice(raw?.unit_price)
        let unitSnapshot = parsePrice(raw?.unit_price_snapshot)
        let caseSnapshot = parsePrice(raw?.case_price_snapshot)

        if (orderUnit === 'case') {
            caseSnapshot = caseSnapshot ?? legacySelectedPrice
            unitSnapshot = unitSnapshot ?? (caseSnapshot ? caseSnapshot / unitsPerCase : null)
        } else {
            unitSnapshot = unitSnapshot ?? legacySelectedPrice
            caseSnapshot = caseSnapshot ?? (unitSnapshot ? unitSnapshot * unitsPerCase : null)
        }

        const selectedPrice = orderUnit === 'case' ? caseSnapshot : unitSnapshot

        return {
            ...raw,
            order_unit: orderUnit,
            units_per_case: unitsPerCase,
            unit_price_snapshot: unitSnapshot,
            case_price_snapshot: caseSnapshot,
            unit_price: selectedPrice ?? legacySelectedPrice ?? 0
        }
    }

    function getSelectedPrice(item: CartItem): number {
        const isCase = item.order_unit === 'case'
        if (isCase && item.case_price_snapshot && item.case_price_snapshot > 0) return item.case_price_snapshot
        if (!isCase && item.unit_price_snapshot && item.unit_price_snapshot > 0) return item.unit_price_snapshot
        return Number(item.unit_price || 0)
    }

    useEffect(() => {
        if (!distributorId) return
        const raw = localStorage.getItem(CART_KEY)
        const cart = raw ? JSON.parse(raw) : { items: [] }
        const cleanItems = (cart.items || []).map((i: any) => normalizeCartItem(i))
        setItems(cleanItems)
    }, [distributorId, CART_KEY])

    const total = useMemo(() => items.reduce((s, i) => {
        return s + computeLineTotal(Number(i.qty), getSelectedPrice(i))
    }, 0), [items])

    function save(next: CartItem[]) {
        setItems(next)
        localStorage.setItem(CART_KEY, JSON.stringify({ items: next }))
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
                // Handle invalid items response from API
                if (json.invalidItems && Array.isArray(json.invalidItems)) {
                    const invalidSet = new Set(json.invalidItems as string[])
                    const removedNames = items
                        .filter((i) => invalidSet.has(i.product_id))
                        .map((i) => i.name)
                    const remaining = items.filter((i) => !invalidSet.has(i.product_id))

                    // Clean the cart
                    save(remaining)

                    setBanner({
                        type: 'warning',
                        message: remaining.length > 0
                            ? 'Some items were removed because they\'re no longer available. You can place your order with the remaining items.'
                            : 'All items in your cart are no longer available and have been removed.',
                        removedNames
                    })

                    // If there are remaining valid items AND the API says to retry,
                    // auto-retry the order with the cleaned cart
                    if (remaining.length > 0 && json.shouldRetry) {
                        // Small delay so user sees the banner, then auto-retry
                        setTimeout(() => placeOrder(), 500)
                    }
                    return
                }

                throw new Error(json?.error || 'Failed to place order')
            }

            localStorage.removeItem(CART_KEY)
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
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Shopping Cart</h1>
                <Link href="/vendor/catalog">
                    <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
                </Link>
            </div>

            {/* Banner for errors / warnings */}
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

                {/* Desktop Summary */}
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

            {/* Mobile Fixed Bottom Bar */}
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
        </div>
    )
}
