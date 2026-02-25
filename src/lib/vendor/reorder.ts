export type CartOrderUnit = 'piece' | 'case'

export type CartStorageItem = {
  product_id: string
  name: string
  unit_price: number
  unit_price_snapshot?: number
  case_price_snapshot?: number
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

function deriveSnapshotPair(
  orderUnit: CartOrderUnit,
  legacyPrice: number,
  unitsPerCase: number,
  rawUnitSnapshot: unknown,
  rawCaseSnapshot: unknown
): { unitSnapshot: number; caseSnapshot: number; selectedPrice: number } {
  const parsedUnitSnapshot = toPositiveNumber(rawUnitSnapshot)
  const parsedCaseSnapshot = toPositiveNumber(rawCaseSnapshot)

  if (orderUnit === 'case') {
    const caseSnapshot = parsedCaseSnapshot ?? legacyPrice
    const unitSnapshot = parsedUnitSnapshot ?? (caseSnapshot / unitsPerCase)
    return {
      unitSnapshot: Math.round(unitSnapshot * 1_000_000) / 1_000_000,
      caseSnapshot: Math.round(caseSnapshot * 1_000_000) / 1_000_000,
      selectedPrice: caseSnapshot
    }
  }

  const unitSnapshot = parsedUnitSnapshot ?? legacyPrice
  const caseSnapshot = parsedCaseSnapshot ?? (unitSnapshot * unitsPerCase)
  return {
    unitSnapshot: Math.round(unitSnapshot * 1_000_000) / 1_000_000,
    caseSnapshot: Math.round(caseSnapshot * 1_000_000) / 1_000_000,
    selectedPrice: unitSnapshot
  }
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

  const legacyPrice = toPositiveNumber(raw.unit_price)
  if (!legacyPrice) return null

  const unitsPerCase = normalizeUnitsPerCase(raw.units_per_case)
  const snapshots = deriveSnapshotPair(
    orderUnit,
    legacyPrice,
    unitsPerCase,
    raw.unit_price_snapshot,
    raw.case_price_snapshot
  )

  const unitPrice = toPositiveNumber(snapshots.selectedPrice)
  if (!unitPrice) return null

  return {
    product_id: productId,
    name: normalizeName(raw.name),
    unit_price: unitPrice,
    unit_price_snapshot: snapshots.unitSnapshot,
    case_price_snapshot: snapshots.caseSnapshot,
    qty,
    order_unit: orderUnit,
    units_per_case: unitsPerCase,
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
      unit_price_snapshot: line.unit_price_snapshot ?? existing.unit_price_snapshot,
      case_price_snapshot: line.case_price_snapshot ?? existing.case_price_snapshot,
      units_per_case: line.units_per_case ?? existing.units_per_case ?? 1,
      name: line.name || existing.name
    })
  }

  return Array.from(lines.values())
}
