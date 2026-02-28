'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addVendorCreditAction, deductVendorCreditAction } from '@/app/actions/vendor-credit'
import { initialVendorCreditActionState } from '@/lib/credits/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/pricing-engine'

type LedgerRow = {
    id: string
    type: string
    amount: number
    note: string | null
    order_id: string | null
    invoice_id: string | null
    created_at: string
}

interface DistributorCreditsPanelProps {
    vendorId: string
    vendorName: string
    balance: number
    ledger: LedgerRow[]
}

function formatLedgerType(type: string): string {
    switch (type) {
        case 'credit_add':
            return 'Credit Added'
        case 'credit_deduct':
            return 'Credit Deducted'
        case 'credit_apply':
            return 'Credit Applied'
        case 'credit_reversal':
            return 'Credit Reversal'
        default:
            return type
    }
}

function amountSign(type: string): '+' | '-' {
    if (type === 'credit_add' || type === 'credit_reversal') return '+'
    return '-'
}

export function DistributorCreditsPanel({ vendorId, vendorName, balance, ledger }: DistributorCreditsPanelProps) {
    const router = useRouter()
    const [addState, addAction] = useActionState(addVendorCreditAction, initialVendorCreditActionState)
    const [deductState, deductAction] = useActionState(deductVendorCreditAction, initialVendorCreditActionState)
    const addRefreshHandledRef = useRef(false)
    const deductRefreshHandledRef = useRef(false)

    useEffect(() => {
        if (addState.success && !addRefreshHandledRef.current) {
            addRefreshHandledRef.current = true
            router.refresh()
            return
        }

        if (!addState.success) addRefreshHandledRef.current = false
    }, [addState.success, router])

    useEffect(() => {
        if (deductState.success && !deductRefreshHandledRef.current) {
            deductRefreshHandledRef.current = true
            router.refresh()
            return
        }

        if (!deductState.success) deductRefreshHandledRef.current = false
    }, [deductState.success, router])

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Vendor</p>
                <p className="text-lg font-semibold text-slate-900">{vendorName}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Available Credit</p>
                <p className="text-3xl font-bold text-emerald-700">{formatMoney(balance)}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <form action={addAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Add Credit</h3>
                    <input type="hidden" name="vendor_id" value={vendorId} />
                    <div className="space-y-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</label>
                        <Input name="amount" type="number" min="0.01" step="0.01" required />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Note</label>
                        <Input name="note" placeholder="Manual credit adjustment" />
                    </div>
                    {addState.error && <p className="text-sm text-red-600">{addState.error}</p>}
                    {addState.success && addState.message && <p className="text-sm text-emerald-700">{addState.message}</p>}
                    <Button type="submit" className="w-full">Add Credit</Button>
                </form>

                <form
                    action={deductAction}
                    className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
                    onSubmit={(event) => {
                        if (!window.confirm('Deduct credit from this vendor balance?')) {
                            event.preventDefault()
                        }
                    }}
                >
                    <h3 className="text-sm font-semibold text-slate-900">Deduct Credit</h3>
                    <input type="hidden" name="vendor_id" value={vendorId} />
                    <div className="space-y-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</label>
                        <Input name="amount" type="number" min="0.01" step="0.01" required />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Note</label>
                        <Input name="note" placeholder="Reason for deduction" />
                    </div>
                    {deductState.error && <p className="text-sm text-red-600">{deductState.error}</p>}
                    {deductState.success && deductState.message && <p className="text-sm text-emerald-700">{deductState.message}</p>}
                    <Button type="submit" variant="outline" className="w-full">Deduct Credit</Button>
                </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Credit Ledger</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-left">Note</th>
                                <th className="px-4 py-3 text-left">Linked</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledger.length === 0 ? (
                                <tr>
                                    <td className="px-4 py-6 text-slate-500" colSpan={5}>No credit activity yet.</td>
                                </tr>
                            ) : (
                                ledger.map((row) => {
                                    const sign = amountSign(row.type)
                                    const signedAmount = `${sign}${formatMoney(row.amount)}`
                                    const amountClass = sign === '+' ? 'text-emerald-700' : 'text-rose-700'
                                    return (
                                        <tr key={row.id} className="border-t border-slate-100 align-top">
                                            <td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                                            <td className="px-4 py-3 font-medium text-slate-800">{formatLedgerType(row.type)}</td>
                                            <td className={`px-4 py-3 text-right font-semibold ${amountClass}`}>{signedAmount}</td>
                                            <td className="px-4 py-3 text-slate-600">{row.note || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {row.order_id ? (
                                                    <Link href={`/distributor/orders/${row.order_id}`} className="text-primary hover:underline">
                                                        Order
                                                    </Link>
                                                ) : null}
                                                {row.order_id && row.invoice_id ? <span className="px-1 text-slate-400">·</span> : null}
                                                {row.invoice_id ? (
                                                    <Link href={`/distributor/invoices/${row.invoice_id}`} className="text-primary hover:underline">
                                                        Invoice
                                                    </Link>
                                                ) : null}
                                                {!row.order_id && !row.invoice_id ? '—' : null}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
