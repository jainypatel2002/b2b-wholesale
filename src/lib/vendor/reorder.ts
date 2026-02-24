export type CartOrderUnit = 'piece' | 'case'

export type CartStorageItem = {
  product_id: string
  name: string
  unit_price: number
  qty: number
  order_unit: CartOrderUnit
  units_per_case?: number
  distributor_id?: string
}

export type ReorderSkippedItem = {
  product_id: string
  name: string
  reason: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeUnit(value: unknown): CartOrderUnit | null {
  if (value === 'piece' || value === 'case') return value
  return null
}

function toPositiveInteger(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return null
  return n
}

function toPositiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 10000) / 10000
}

function normalizeName(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw || 'Unknown product'
}

function normalizeUnitsPerCase(value: unknown): number {
  const parsed = toPositiveInteger(value)
  return parsed ?? 1
}

function normalizeCartLine(input: unknown): CartStorageItem | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const productId = typeof raw.product_id === 'string' ? raw.product_id.trim() : ''
  if (!UUID_REGEX.test(productId)) return null

  const orderUnit = normalizeUnit(raw.order_unit)
  if (!orderUnit) return null

  const qty = toPositiveInteger(raw.qty)
  if (!qty) return null

  const unitPrice = toPositiveNumber(raw.unit_price)
  if (!unitPrice) return null

  return {
    product_id: productId,
    name: normalizeName(raw.name),
    unit_price: unitPrice,
    qty,
    order_unit: orderUnit,
    units_per_case: normalizeUnitsPerCase(raw.units_per_case),
    distributor_id: typeof raw.distributor_id === 'string' ? raw.distributor_id : undefined
  }
}

export function addManyToCart(current: unknown[], incoming: unknown[]): CartStorageItem[] {
  const lines = new Map<string, CartStorageItem>()

  for (const raw of Array.isArray(current) ? current : []) {
    const line = normalizeCartLine(raw)
    if (!line) continue
    const key = `${line.product_id}:${line.order_unit}`
    lines.set(key, line)
  }

  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const line = normalizeCartLine(raw)
    if (!line) continue

    const key = `${line.product_id}:${line.order_unit}`
    const existing = lines.get(key)

    if (!existing) {
      lines.set(key, line)
      continue
    }

    const mergedQty = existing.qty + line.qty
    if (!Number.isFinite(mergedQty) || mergedQty < 1 || !Number.isInteger(mergedQty)) {
      continue
    }

    lines.set(key, {
      ...existing,
      qty: mergedQty,
      unit_price: line.unit_price,
      units_per_case: line.units_per_case ?? existing.units_per_case ?? 1,
      name: line.name || existing.name
    })
  }

  return Array.from(lines.values())
}
