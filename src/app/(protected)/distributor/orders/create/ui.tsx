'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getEffectivePrice, formatPriceLabel } from '@/lib/pricing-engine'
import { createDistributorOrderAction, fetchVendorOrderOverrides } from './actions'

type OrderUnit = 'piece' | 'case'

interface VendorOption {
  id: string
  name: string
}

interface ProductRecord {
  id: string
  name: string
  sku: string | null
  stock_qty: number | null
  stock_pieces: number | null
  allow_case: boolean
  allow_piece: boolean
  units_per_case: number | null
  sell_price: number | null
  price_case: number | null
  sell_per_unit: number | null
  sell_per_case: number | null
  category_id: string | null
  category_node_id: string | null
  categories?: { name?: string | null } | null
  category_nodes?: { name?: string | null } | null
}

interface OverrideRow {
  product_id: string
  price_per_unit: number | null
  price_per_case: number | null
}

interface CartLine {
  product_id: string
  name: string
  qty: number
  order_unit: OrderUnit
  unit_price: number
  units_per_case: number
}

interface DraftLineState {
  order_unit: OrderUnit
  qty: string
}

function toPositiveInt(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  if (!Number.isInteger(n)) return null
  return n
}

function defaultOrderUnit(product: ProductRecord): OrderUnit {
  if (product.allow_piece) return 'piece'
  return 'case'
}

export function DistributorCreateOrderClient({
  vendors,
  products
}: {
  vendors: VendorOption[]
  products: ProductRecord[]
}) {
  const router = useRouter()

  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [nodeFilter, setNodeFilter] = useState('all')
  const [inStockOnly, setInStockOnly] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, DraftLineState>>({})
  const [cart, setCart] = useState<CartLine[]>([])
  const [overrides, setOverrides] = useState<Map<string, OverrideRow>>(new Map())
  const [loadingOverrides, setLoadingOverrides] = useState(false)
  const [isSubmitting, startSubmitTransition] = useTransition()

  useEffect(() => {
    setCart([])
    if (!selectedVendorId) {
      setOverrides(new Map())
      return
    }

    let cancelled = false
    setLoadingOverrides(true)

    fetchVendorOrderOverrides(selectedVendorId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          toast.error(res.error || 'Failed to load vendor overrides')
          setOverrides(new Map())
          return
        }

        const map = new Map<string, OverrideRow>()
        for (const row of (res.overrides ?? [])) {
          map.set(row.product_id, row as OverrideRow)
        }
        setOverrides(map)
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load vendor overrides')
      })
      .finally(() => {
        if (!cancelled) setLoadingOverrides(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedVendorId])

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      if (!p.category_id) continue
      map.set(p.category_id, p.categories?.name || 'Uncategorized')
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const nodes = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      if (!p.category_node_id) continue
      map.set(p.category_node_id, p.category_nodes?.name || 'Uncategorized')
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products])

  const filteredProducts = useMemo(() => {
    let rows = products

    if (searchTerm.trim()) {
      const lower = searchTerm.trim().toLowerCase()
      rows = rows.filter((p) => {
        const categoryName = p.categories?.name || ''
        const nodeName = p.category_nodes?.name || ''
        return (
          p.name.toLowerCase().includes(lower)
          || (p.sku || '').toLowerCase().includes(lower)
          || categoryName.toLowerCase().includes(lower)
          || nodeName.toLowerCase().includes(lower)
        )
      })
    }

    if (categoryFilter !== 'all') {
      rows = rows.filter((p) => p.category_id === categoryFilter)
    }

    if (nodeFilter !== 'all') {
      rows = rows.filter((p) => p.category_node_id === nodeFilter)
    }

    if (inStockOnly) {
      rows = rows.filter((p) => Number(p.stock_pieces || 0) > 0)
    }

    return rows
  }, [products, searchTerm, categoryFilter, nodeFilter, inStockOnly])

  function resolveProductPrice(product: ProductRecord, orderUnit: OrderUnit): number | null {
    const override = overrides.get(product.id)

    return getEffectivePrice(
      {
        sell_per_unit: product.sell_per_unit,
        sell_per_case: product.sell_per_case,
        sell_price: product.sell_price,
        price_case: product.price_case,
        units_per_case: product.units_per_case,
        allow_piece: product.allow_piece,
        allow_case: product.allow_case,
        override_unit_price: override?.price_per_unit ?? null,
        override_case_price: override?.price_per_case ?? null
      },
      orderUnit
    )
  }

  function getDraft(product: ProductRecord): DraftLineState {
    return drafts[product.id] || {
      order_unit: defaultOrderUnit(product),
      qty: '1'
    }
  }

  function setDraft(product: ProductRecord, patch: Partial<DraftLineState>) {
    setDrafts((prev) => ({
      ...prev,
      [product.id]: {
        ...(prev[product.id] || { order_unit: defaultOrderUnit(product), qty: '1' }),
        ...patch
      }
    }))
  }

  function addToCart(product: ProductRecord) {
    if (!selectedVendorId) {
      toast.error('Select a vendor first')
      return
    }

    const draft = getDraft(product)
    const qty = toPositiveInt(draft.qty)
    if (!qty) {
      toast.error('Quantity must be a whole number greater than zero')
      return
    }

    const unitPrice = resolveProductPrice(product, draft.order_unit)
    if (unitPrice === null || unitPrice <= 0) {
      toast.error(`Price is not configured for ${product.name} (${draft.order_unit})`)
      return
    }

    setCart((prev) => {
      const index = prev.findIndex((line) => (
        line.product_id === product.id && line.order_unit === draft.order_unit
      ))

      if (index === -1) {
        return [
          ...prev,
          {
            product_id: product.id,
            name: product.name,
            qty,
            order_unit: draft.order_unit,
            unit_price: unitPrice,
            units_per_case: Number(product.units_per_case || 1)
          }
        ]
      }

      const clone = [...prev]
      clone[index] = { ...clone[index], qty: clone[index].qty + qty }
      return clone
    })

    setDraft(product, { qty: '1' })
  }

  function updateCartQty(index: number, qty: number) {
    setCart((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], qty: Math.max(1, Math.floor(qty)) }
      return next
    })
  }

  function removeCartLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = useMemo(() => (
    cart.reduce((sum, line) => sum + (line.qty * line.unit_price), 0)
  ), [cart])

  const canSubmit = selectedVendorId.length > 0 && cart.length > 0 && !loadingOverrides

  function submitOrder() {
    if (!canSubmit) return

    startSubmitTransition(async () => {
      const result = await createDistributorOrderAction({
        vendorId: selectedVendorId,
        items: cart.map((line) => ({
          product_id: line.product_id,
          qty: line.qty,
          order_unit: line.order_unit
        }))
      })

      if (!result.ok) {
        toast.error(result.error || 'Failed to create order')
        return
      }

      toast.success('Order created successfully')
      router.push(`/distributor/orders/${result.orderId}`)
    })
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Vendor</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedVendorId}
                onChange={(event) => setSelectedVendorId(event.target.value)}
              >
                <option value="">Select linked vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Category</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Subcategory</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={nodeFilter}
                onChange={(event) => setNodeFilter(event.target.value)}
              >
                <option value="all">All subcategories</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Search</label>
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9 h-10"
                  placeholder="Search products"
                />
              </div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => setInStockOnly(event.target.checked)}
            />
            In-stock only
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedVendorId && (
                <div className="text-sm text-slate-500 border border-dashed rounded-md p-4">
                  Select a vendor to view effective pricing and add items.
                </div>
              )}

              {selectedVendorId && loadingOverrides && (
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading vendor pricing overrides...
                </div>
              )}

              {selectedVendorId && !loadingOverrides && filteredProducts.length === 0 && (
                <div className="text-sm text-slate-500 border border-dashed rounded-md p-4">
                  No products match your filters.
                </div>
              )}

              {selectedVendorId && !loadingOverrides && filteredProducts.map((product) => {
                const draft = getDraft(product)
                const piecePrice = resolveProductPrice(product, 'piece')
                const casePrice = resolveProductPrice(product, 'case')
                const selectedPrice = draft.order_unit === 'case' ? casePrice : piecePrice
                const canAdd = selectedPrice !== null && selectedPrice > 0
                const unitsPerCase = Number(product.units_per_case || 1)

                return (
                  <div key={product.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {product.sku || 'No SKU'}
                          {product.categories?.name ? ` • ${product.categories.name}` : ''}
                          {product.category_nodes?.name ? ` • ${product.category_nodes.name}` : ''}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {product.allow_piece && (
                            <Badge variant="secondary" className="font-normal">
                              {piecePrice !== null && piecePrice > 0
                                ? formatPriceLabel(piecePrice, 'piece')
                                : 'Unit price missing'}
                            </Badge>
                          )}
                          {product.allow_case && (
                            <Badge variant="secondary" className="font-normal">
                              {casePrice !== null && casePrice > 0
                                ? `${formatPriceLabel(casePrice, 'case')} (${unitsPerCase}/case)`
                                : 'Case price missing'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>{Number(product.stock_pieces || 0)} units in stock</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                        value={draft.order_unit}
                        onChange={(event) => {
                          setDraft(product, { order_unit: event.target.value as OrderUnit })
                        }}
                      >
                        {product.allow_piece && <option value="piece">Unit</option>}
                        {product.allow_case && <option value="case">Case</option>}
                      </select>

                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={draft.qty}
                        onChange={(event) => setDraft(product, { qty: event.target.value })}
                        className="h-9 w-24"
                      />

                      <Button
                        size="sm"
                        onClick={() => addToCart(product)}
                        disabled={!canAdd}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="lg:sticky lg:top-24">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <div className="text-sm text-slate-500">No items added yet.</div>
              ) : (
                <div className="space-y-3">
                  {cart.map((line, index) => {
                    const lineTotal = line.qty * line.unit_price
                    return (
                      <div key={`${line.product_id}-${line.order_unit}`} className="border rounded-md p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{line.name}</div>
                            <div className="text-xs text-slate-500">
                              {formatPriceLabel(line.unit_price, line.order_unit)}
                              {line.order_unit === 'case' && line.units_per_case > 0 ? ` • ${line.units_per_case}/case` : ''}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => removeCartLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => updateCartQty(index, line.qty - 1)}
                            >
                              -
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={line.qty}
                              onChange={(event) => {
                                const next = toPositiveInt(event.target.value)
                                if (next) updateCartQty(index, next)
                              }}
                              className="h-7 w-16 text-center"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => updateCartQty(index, line.qty + 1)}
                            >
                              +
                            </Button>
                          </div>
                          <div className="text-sm font-semibold">${lineTotal.toFixed(2)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="pt-2 border-t text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="text-base font-bold">${subtotal.toFixed(2)}</span>
                </div>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!canSubmit || isSubmitting}
                onClick={submitOrder}
              >
                {isSubmitting ? 'Creating...' : 'Create Order'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
