import { getEffectivePrice, type ProductPricing } from '@/lib/pricing-engine'
import { addManyToCart, type CartOrderUnit, type CartStorageItem } from '@/lib/vendor/reorder'

export type CartLikeProduct = ProductPricing & {
  id: string
  name: string
}

export type CartAddFailureReason =
  | 'invalid_distributor'
  | 'unit_not_allowed'
  | 'price_unavailable'
  | 'line_rejected'

export type AddProductToVendorCartResult =
  | {
      ok: true
      items: CartStorageItem[]
      orderUnit: CartOrderUnit
    }
  | {
      ok: false
      items: CartStorageItem[]
      orderUnit: CartOrderUnit | null
      reason: CartAddFailureReason
    }

function canOrderByUnit(product: CartLikeProduct, orderUnit: CartOrderUnit): boolean {
  if (orderUnit === 'piece') return product.allow_piece !== false
  return product.allow_case !== false
}

function hasValidPrice(product: CartLikeProduct, orderUnit: CartOrderUnit): boolean {
  const price = getEffectivePrice(product, orderUnit)
  return !!price && price > 0
}

function resolveOrderUnit(
  product: CartLikeProduct,
  requestedUnit?: CartOrderUnit
): { orderUnit: CartOrderUnit | null; reason: CartAddFailureReason | null } {
  if (requestedUnit) {
    if (!canOrderByUnit(product, requestedUnit)) {
      return { orderUnit: null, reason: 'unit_not_allowed' }
    }

    if (!hasValidPrice(product, requestedUnit)) {
      return { orderUnit: null, reason: 'price_unavailable' }
    }

    return { orderUnit: requestedUnit, reason: null }
  }

  const pieceAllowed = canOrderByUnit(product, 'piece')
  const caseAllowed = canOrderByUnit(product, 'case')

  if (pieceAllowed && hasValidPrice(product, 'piece')) {
    return { orderUnit: 'piece', reason: null }
  }

  if (caseAllowed && hasValidPrice(product, 'case')) {
    return { orderUnit: 'case', reason: null }
  }

  if (!pieceAllowed && !caseAllowed) {
    return { orderUnit: null, reason: 'unit_not_allowed' }
  }

  return { orderUnit: null, reason: 'price_unavailable' }
}

export function getCartStorageKey(distributorId: string): string {
  return `dv_cart_${distributorId}`
}

export function normalizeCartItems(input: unknown): CartStorageItem[] {
  const rows = Array.isArray(input) ? input : []
  return addManyToCart([], rows)
}

export function parseCartStoragePayload(raw: string | null): CartStorageItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { items?: unknown[] } | null
    return normalizeCartItems(parsed?.items ?? [])
  } catch {
    return []
  }
}

export function serializeCartStoragePayload(items: unknown): string {
  const normalized = normalizeCartItems(items)
  return JSON.stringify({ items: normalized })
}

export function readCartItemsFromStorage(distributorId: string): CartStorageItem[] {
  if (typeof window === 'undefined') return []
  const key = getCartStorageKey(distributorId)
  return parseCartStoragePayload(window.localStorage.getItem(key))
}

export function writeCartItemsToStorage(distributorId: string, items: unknown): CartStorageItem[] {
  const normalized = normalizeCartItems(items)
  if (typeof window !== 'undefined') {
    const key = getCartStorageKey(distributorId)
    window.localStorage.setItem(key, JSON.stringify({ items: normalized }))
    window.dispatchEvent(new Event('cart-updated'))
  }
  return normalized
}

export function getCartItemQuantity(
  items: unknown,
  productId: string,
  orderUnit: CartOrderUnit
): number {
  const normalized = normalizeCartItems(items)
  const line = normalized.find((item) => item.product_id === productId && item.order_unit === orderUnit)
  return line?.qty ?? 0
}

export function buildCartItemFromProduct(
  product: CartLikeProduct,
  orderUnit: CartOrderUnit,
  qty: number
): CartStorageItem | null {
  if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) return null

  const unitsPerCase = Math.max(1, Math.floor(Number(product.units_per_case ?? 1)))
  const unitPriceSnapshot = getEffectivePrice(product, 'piece')
  const casePriceSnapshot = getEffectivePrice(product, 'case')
  const selectedPrice = orderUnit === 'case' ? casePriceSnapshot : unitPriceSnapshot

  if (!selectedPrice || selectedPrice <= 0) return null

  return {
    product_id: product.id,
    name: product.name,
    unit_price: selectedPrice,
    unit_price_snapshot: unitPriceSnapshot ?? selectedPrice,
    case_price_snapshot: casePriceSnapshot ?? selectedPrice,
    qty,
    order_unit: orderUnit,
    units_per_case: unitsPerCase
  }
}

export function addOrIncrementProductInCart(
  existingItems: unknown,
  product: CartLikeProduct,
  orderUnit: CartOrderUnit,
  qty = 1
): CartStorageItem[] {
  const normalized = normalizeCartItems(existingItems)
  const line = buildCartItemFromProduct(product, orderUnit, qty)
  if (!line) return normalized
  return addManyToCart(normalized, [line])
}

export function addProductToVendorCart({
  distributorId,
  product,
  requestedUnit,
  qty = 1,
  existingItems
}: {
  distributorId: string
  product: CartLikeProduct
  requestedUnit?: CartOrderUnit
  qty?: number
  existingItems?: unknown
}): AddProductToVendorCartResult {
  if (!distributorId) {
    const fallbackItems = existingItems === undefined ? [] : normalizeCartItems(existingItems)
    return {
      ok: false,
      items: fallbackItems,
      orderUnit: null,
      reason: 'invalid_distributor'
    }
  }

  const source = existingItems === undefined
    ? readCartItemsFromStorage(distributorId)
    : normalizeCartItems(existingItems)

  const { orderUnit, reason } = resolveOrderUnit(product, requestedUnit)
  if (!orderUnit) {
    return {
      ok: false,
      items: source,
      orderUnit: null,
      reason: reason ?? 'line_rejected'
    }
  }

  const addQty = Math.max(1, Math.floor(Number(qty) || 1))
  const beforeQty = getCartItemQuantity(source, product.id, orderUnit)
  const next = addOrIncrementProductInCart(source, product, orderUnit, addQty).map((line) => ({
    ...line,
    distributor_id: distributorId
  }))
  const saved = writeCartItemsToStorage(distributorId, next)
  const afterQty = getCartItemQuantity(saved, product.id, orderUnit)

  if (afterQty <= beforeQty) {
    return {
      ok: false,
      items: saved,
      orderUnit,
      reason: 'line_rejected'
    }
  }

  return {
    ok: true,
    items: saved,
    orderUnit
  }
}

export function decrementProductInCart(
  existingItems: unknown,
  productId: string,
  orderUnit: CartOrderUnit,
  qty = 1
): CartStorageItem[] {
  const normalized = normalizeCartItems(existingItems)
  const decrementBy = Math.max(1, Math.floor(Number(qty) || 1))

  const next = normalized
    .map((line) => {
      if (line.product_id !== productId || line.order_unit !== orderUnit) return line
      return { ...line, qty: line.qty - decrementBy }
    })
    .filter((line) => line.qty > 0)

  return normalizeCartItems(next)
}
