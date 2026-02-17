'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type CartItem = { product_id: string; name: string; unit_price: number; qty: number }

export default function VendorCartPage() {
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('dv_cart')
    const cart = raw ? JSON.parse(raw) : { items: [] }
    setItems(cart.items || [])
  }, [])

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.unit_price) * Number(i.qty), 0), [items])

  function save(next: CartItem[]) {
    setItems(next)
    localStorage.setItem('dv_cart', JSON.stringify({ items: next }))
  }

  function inc(id: string) {
    save(items.map((i) => (i.product_id === id ? { ...i, qty: i.qty + 1 } : i)))
  }

  function dec(id: string) {
    save(items
      .map((i) => (i.product_id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))
    )
  }

  function remove(id: string) {
    save(items.filter((i) => i.product_id !== id))
  }

  async function placeOrder() {
    setLoading(true)
    try {
      const res = await fetch('/api/vendor/place-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })) })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed')

      localStorage.removeItem('dv_cart')
      window.location.href = `/vendor/orders/${json.order_id}`
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cart</h1>
        <Link className="link" href="/vendor">← Back</Link>
      </div>

      <div className="card p-6">
        {items.length ? (
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.product_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-sm text-slate-600">{Number(i.unit_price).toFixed(2)} each</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn" onClick={() => dec(i.product_id)}>-</button>
                  <div className="w-10 text-center">{i.qty}</div>
                  <button className="btn" onClick={() => inc(i.product_id)}>+</button>
                  <button className="btn" onClick={() => remove(i.product_id)}>Remove</button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="text-sm text-slate-600">Total</div>
              <div className="text-xl font-semibold">{total.toFixed(2)}</div>
            </div>

            <button className="btn w-full" disabled={loading} onClick={placeOrder}>
              {loading ? 'Placing order…' : 'Place order'}
            </button>

            <p className="text-xs text-slate-500">Payment is cash. The distributor will create an invoice.</p>
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            Your cart is empty. <Link className="link" href="/vendor/catalog">Go to catalog</Link>
          </div>
        )}
      </div>
    </div>
  )
}
