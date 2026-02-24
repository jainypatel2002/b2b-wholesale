'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw, ShoppingCart, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { addManyToCart, type CartStorageItem, type ReorderSkippedItem } from '@/lib/vendor/reorder'

type LastOrderPayload = {
  orderId: string
  createdAt: string
  items: CartStorageItem[]
  skipped: ReorderSkippedItem[]
}

export function ReorderLastOrderButton({ distributorId }: { distributorId: string }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(false)
  const [lastOrder, setLastOrder] = useState<LastOrderPayload | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  async function handleOpen() {
    if (!distributorId) {
      toast.error('No active distributor selected')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/vendor/last-order?distributorId=${encodeURIComponent(distributorId)}`, {
        method: 'GET',
        cache: 'no-store'
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load previous order')
      }

      if (!payload?.last_order) {
        toast.message('No previous order found for this distributor')
        return
      }

      setLastOrder(payload.last_order as LastOrderPayload)
      setOpen(true)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load previous order')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (adding) return
    setOpen(false)
  }

  function handleAddToCart() {
    if (!lastOrder || lastOrder.items.length === 0) return

    setAdding(true)
    try {
      const key = `dv_cart_${distributorId}`
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : { items: [] as unknown[] }
      const currentItems = Array.isArray(parsed?.items) ? parsed.items : []
      const incomingItems = lastOrder.items.map((line) => ({
        ...line,
        distributor_id: distributorId
      }))

      const merged = addManyToCart(currentItems, incomingItems)
      localStorage.setItem(key, JSON.stringify({ items: merged }))
      window.dispatchEvent(new Event('cart-updated'))

      toast.success(`Added ${lastOrder.items.length} items from your last order`)
      if (lastOrder.skipped.length > 0) {
        toast.warning(`Skipped ${lastOrder.skipped.length} unavailable item${lastOrder.skipped.length === 1 ? '' : 's'}`)
      }

      setOpen(false)
      router.push('/vendor/cart')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add items to cart')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} disabled={loading}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {loading ? 'Loading...' : 'Reorder Last Order'}
      </Button>

      {open && mounted && lastOrder && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Reorder Last Order</h3>
                <p className="text-xs text-slate-500 sm:text-sm">
                  {new Date(lastOrder.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-slate-400 transition-colors hover:text-slate-600"
                onClick={handleClose}
                aria-label="Close reorder modal"
                disabled={adding}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              {lastOrder.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No reorderable items remain from your last order.
                </div>
              ) : (
                <div className="space-y-2">
                  {lastOrder.items.map((item) => (
                    <div
                      key={`${item.product_id}:${item.order_unit}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.qty} {item.order_unit === 'case' ? (item.qty === 1 ? 'case' : 'cases') : (item.qty === 1 ? 'unit' : 'units')}
                          {item.order_unit === 'case' && item.units_per_case ? ` · ${item.units_per_case} units/case` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-900">${Number(item.unit_price).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}

              {lastOrder.skipped.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <div className="mb-2 flex items-start gap-2 text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-sm font-medium">Skipped items</p>
                  </div>
                  <div className="space-y-1">
                    {lastOrder.skipped.map((item) => (
                      <p key={`${item.product_id}:${item.reason}`} className="text-xs text-amber-800">
                        {item.name}: {item.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/70 px-4 py-3 sm:px-5">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={handleClose} disabled={adding}>
                  Cancel
                </Button>
                <Button onClick={handleAddToCart} disabled={adding || lastOrder.items.length === 0}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {adding ? 'Adding...' : 'Add to Cart'}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
