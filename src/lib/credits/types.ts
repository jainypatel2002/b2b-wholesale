export type VendorCreditActionState = {
    success: boolean
    error: string | null
    message?: string | null
    newBalance?: number | null
    appliedAmount?: number | null
    orderTotal?: number | null
    amountDue?: number | null
    invoiceId?: string | null
}

export const initialVendorCreditActionState: VendorCreditActionState = {
    success: false,
    error: null,
    message: null,
    newBalance: null,
    appliedAmount: null,
    orderTotal: null,
    amountDue: null,
    invoiceId: null,
}
