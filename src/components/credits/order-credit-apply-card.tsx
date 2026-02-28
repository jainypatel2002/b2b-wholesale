'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyVendorCreditToOrderAction } from '@/app/actions/vendor-credit'
import { initialVendorCreditActionState } from '@/lib/credits/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { computeAmountDue, toMoney } from '@/lib/credits/calc'
import { formatMoney } from '@/lib/pricing-engine'

interface OrderCreditApplyCardProps {
    vendorId: string
    orderId: string
    availableBalance: number
    currentApplied: number
    orderTotal: number
}

export function OrderCreditApplyCard({
    vendorId,
    orderId,
    availableBalance,
    currentApplied,
    orderTotal,
}: OrderCreditApplyCardProps) {
    const router = useRouter()
    const [state, formAction] = useActionState(applyVendorCreditToOrderAction, initialVendorCreditActionState)
    const [amountInput, setAmountInput] = useState(String(toMoney(currentApplied)))
    const refreshHandledRef = useRef(false)

    useEffect(() => {
        setAmountInput(String(toMoney(currentApplied)))
    }, [currentApplied])

    useEffect(() => {
        if (state.success && !refreshHandledRef.current) {
            refreshHandledRef.current = true
            router.refresh()
            return
        }

        if (!state.success) refreshHandledRef.current = false
    }, [router, state.success])

    const parsedAmount = Number(amountInput)
    const safeAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? toMoney(parsedAmount) : 0
    const maxApplicable = toMoney(Math.min(orderTotal, availableBalance + currentApplied))
    const projectedDue = computeAmountDue(orderTotal, safeAmount)

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Apply Credit</h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="flex justify-between">
                    <span>Order total</span>
                    <span className="font-medium">{formatMoney(orderTotal)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                    <span>Available credit</span>
                    <span className="font-medium">{formatMoney(availableBalance)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                    <span>Currently applied</span>
                    <span className="font-medium">{formatMoney(currentApplied)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
                    <span>Projected amount due</span>
                    <span className="text-base font-semibold">{formatMoney(projectedDue)}</span>
                </div>
            </div>

            <form action={formAction} className="space-y-3">
                <input type="hidden" name="vendor_id" value={vendorId} />
                <input type="hidden" name="order_id" value={orderId} />

                <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Credit amount</label>
                    <div className="flex gap-2">
                        <Input
                            name="amount"
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={amountInput}
                            onChange={(event) => setAmountInput(event.target.value)}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAmountInput(String(maxApplicable))}
                        >
                            Max
                        </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                        Maximum credit for this order: {formatMoney(maxApplicable)}
                    </p>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Note (optional)</label>
                    <Input name="note" placeholder="Reason for credit application" />
                </div>

                {state.error && <p className="text-sm text-red-600">{state.error}</p>}
                {state.success && state.message && <p className="text-sm text-emerald-700">{state.message}</p>}

                <Button type="submit" className="w-full">Save Credit</Button>
            </form>
        </div>
    )
}
