'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Trash2, ShoppingCart } from 'lucide-react'

type CartItem = {
    product_id: string;
    name: string;
    unit_price: number;
    qty: number;
    order_unit: 'piece' | 'case';
    units_per_case?: number;
}

export function CartClient({ distributorId }: { distributorId: string }) {
    const [items, setItems] = useState<CartItem[]>([])
    const [loading, setLoading] = useState(false)

    // Use scoped key
    const CART_KEY = `dv_cart_${distributorId}`

    useEffect(() => {
        if (!distributorId) return

        // Migration: Check for legacy cart? 
        // Ideally we ignore it or maybe migrate it once. For now, strict scoping.
        const raw = localStorage.getItem(CART_KEY)

        // Fallback: If no scoped cart exists, maybe check legacy 'dv_cart' ONCE and migrate?
        // Let's keep it simple: strict scoping resets cart on first switch, which user approved.

        const cart = raw ? JSON.parse(raw) : { items: [] }
        const cleanItems = (cart.items || []).map((i: any) => ({
            ...i,
            order_unit: i.order_unit || 'piece',
            units_per_case: i.units_per_case || 1
        }))
        setItems(cleanItems)
    }, [distributorId, CART_KEY])

    const total = useMemo(() => items.reduce((s, i) => {
        const multiplier = i.order_unit === 'case' ? (i.units_per_case || 1) : 1
        return s + (Number(i.unit_price) * multiplier * Number(i.qty))
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
        try {
            const res = await fetch('/api/vendor/place-order', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    distributorId, // Pass context explicitly
                    items: items.map((i) => ({
                        product_id: i.product_id,
                        qty: i.qty,
                        order_unit: i.order_unit
                    }))
                })
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json?.error || 'Failed')

            localStorage.removeItem(CART_KEY)
            window.location.href = `/vendor/orders/${json.order_id}`
        } catch (e: any) {
            alert(e.message)
        } finally {
            setLoading(false)
        }
    }

    if (!distributorId) {
        return <div className="p-8 text-center text-slate-500">Loading cart context...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Shopping Cart</h1>
                <Link href="/vendor/catalog">
                    <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
                </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-3 pb-48 md:pb-0">
                <div className="md:col-span-2 space-y-4">
                    {items.length ? (
                        items.map((i, idx) => {
                            const isCase = i.order_unit === 'case'
                            const multiplier = isCase ? (i.units_per_case || 1) : 1
                            const lineTotal = Number(i.unit_price) * multiplier * i.qty

                            return (
                                <Card key={`${i.product_id}-${i.order_unit}-${idx}`}>
                                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="font-semibold text-lg flex items-center gap-2">
                                                {i.name}
                                                <span className="text-xs font-normal px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 uppercase">
                                                    {isCase ? `Case (${i.units_per_case})` : 'Piece'}
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                ${Number(i.unit_price).toFixed(2)} / unit
                                                {isCase && ` × ${i.units_per_case} = $${(Number(i.unit_price) * multiplier).toFixed(2)} / case`}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end mt-2 sm:mt-0">
                                            <div className="flex items-center rounded-md border border-slate-200">
                                                <button className="h-10 w-10 flex items-center justify-center hover:bg-slate-50 text-lg" onClick={() => dec(i.product_id, i.order_unit)}>-</button>
                                                <div className="w-12 text-center font-medium">{i.qty}</div>
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
                                <p className="text-slate-500 mt-1 mb-6">Looks like you haven't added anything to your cart yet.</p>
                                <Link href="/vendor/catalog">
                                    <Button>Browse Catalog</Button>
                                </Link>
                            </CardContent>
                        </Card>
                    )}
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
                        </CardContent>
                        <CardFooter className="flex-col gap-3">
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg" disabled={items.length === 0 || loading} onClick={placeOrder}>
                                {loading ? 'Processing...' : 'Place Order'}
                            </Button>
                            <p className="text-xs text-center text-slate-500">
                                Payment due upon invoice creation.
                            </p>
                        </CardFooter>
                    </Card>
                </div>

                {/* Mobile Fixed Bottom Bar */}
                <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-slate-200 p-4 md:hidden z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-slate-500">Total</span>
                        <span className="text-xl font-bold text-slate-900">${total.toFixed(2)}</span>
                    </div>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-lg" disabled={items.length === 0 || loading} onClick={placeOrder}>
                        {loading ? 'Processing...' : 'Place Order'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
