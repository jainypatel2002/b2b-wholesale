import { isUuid } from '@/lib/vendor/favorites'
import { normalizeCartItems } from '@/lib/vendor/cart-storage'
import type { CartStorageItem } from '@/lib/vendor/reorder'

export const MAX_DRAFT_NAME_LENGTH = 120

export type VendorDraftOrderRow = {
  id: string
  vendor_id: string
  distributor_id: string
  name: string | null
  status: string
  currency: string
  cart_payload: { items: CartStorageItem[] }
  subtotal_snapshot: number | null
  created_at: string
  updated_at: string
}

export function isMissingDraftTableError(error: any): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code === '42P01' || message.includes('vendor_draft_orders')
}

export function sanitizeDraftName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_DRAFT_NAME_LENGTH)
}

export function sanitizeDraftCurrency(input: unknown): string {
  if (typeof input !== 'string') return 'usd'
  const normalized = input.trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(normalized)) return 'usd'
  return normalized
}

export function normalizeDraftCartPayload(payload: unknown): { items: CartStorageItem[] } {
  if (Array.isArray(payload)) {
    return { items: normalizeCartItems(payload) }
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as { items?: unknown[] }
    return { items: normalizeCartItems(obj.items ?? []) }
  }

  return { items: [] }
}

export function normalizeDraftRow(raw: any): VendorDraftOrderRow | null {
  const id = String(raw?.id || '').trim()
  const vendorId = String(raw?.vendor_id || '').trim()
  const distributorId = String(raw?.distributor_id || '').trim()
  if (!isUuid(id) || !isUuid(vendorId) || !isUuid(distributorId)) return null

  const cartPayload = normalizeDraftCartPayload(raw?.cart_payload)
  const subtotal = Number(raw?.subtotal_snapshot)
  const status = String(raw?.status || 'draft')
  const currency = sanitizeDraftCurrency(raw?.currency)
  const createdAt = String(raw?.created_at || '')
  const updatedAt = String(raw?.updated_at || '')

  return {
    id,
    vendor_id: vendorId,
    distributor_id: distributorId,
    name: sanitizeDraftName(raw?.name),
    status,
    currency,
    cart_payload: cartPayload,
    subtotal_snapshot: Number.isFinite(subtotal) ? subtotal : null,
    created_at: createdAt,
    updated_at: updatedAt
  }
}

