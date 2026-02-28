export type CreditLedgerType = 'credit_add' | 'credit_deduct' | 'credit_apply' | 'credit_reversal'

export function toMoney(value: unknown): number {
    const numeric = Number(value ?? 0)
    if (!Number.isFinite(numeric)) return 0
    return Math.round(numeric * 100) / 100
}

export function computeVendorCreditBalance(rows: Array<{ type?: unknown; amount?: unknown }>): number {
    let running = 0

    for (const row of rows) {
        const amount = toMoney(row?.amount)
        const type = String(row?.type || '')

        if (type === 'credit_add' || type === 'credit_reversal') {
            running += amount
            continue
        }

        if (type === 'credit_deduct' || type === 'credit_apply') {
            running -= amount
        }
    }

    return toMoney(running)
}

export function computeTaxTotal(taxes: Array<{ type?: unknown; rate_percent?: unknown }>, taxableBase: number): number {
    let taxTotal = 0

    for (const tax of taxes) {
        const type = String(tax?.type || '')
        const rate = toMoney(tax?.rate_percent)

        if (type === 'percent') {
            taxTotal += taxableBase * (rate / 100)
            continue
        }

        taxTotal += rate
    }

    return toMoney(taxTotal)
}

export function computeOrderTotal(params: {
    subtotal: number
    adjustmentTotal?: number
    taxes?: Array<{ type?: unknown; rate_percent?: unknown }>
}): number {
    const subtotal = toMoney(params.subtotal)
    const adjustments = toMoney(params.adjustmentTotal ?? 0)
    const taxableBase = subtotal + adjustments
    const taxTotal = computeTaxTotal(params.taxes ?? [], taxableBase)
    return toMoney(taxableBase + taxTotal)
}

export function computeAmountDue(total: number, creditApplied: number): number {
    return toMoney(Math.max(toMoney(total) - toMoney(creditApplied), 0))
}
