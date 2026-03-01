'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  initialOrderPaymentActionState,
  recordOrderPaymentAction,
} from '@/app/actions/order-payments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/pricing-engine'

type PaymentHistoryRow = {
  id: string
  amount: number
  method: string | null
  note: string | null
  paid_at: string
}

interface OrderPaymentPanelProps {
  orderId: string
  totalAmount: number
  amountPaid: number
  amountDue: number
  payments: PaymentHistoryRow[]
  canRecordPayment?: boolean
}

function formatMethod(method: string | null): string {
  if (!method) return 'Unspecified'
  return method
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function OrderPaymentPanel({
  orderId,
  totalAmount,
  amountPaid,
  amountDue,
  payments,
  canRecordPayment = false,
}: OrderPaymentPanelProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const refreshHandledRef = useRef(false)
  const [state, formAction, isPending] = useActionState(
    recordOrderPaymentAction,
    initialOrderPaymentActionState,
  )

  useEffect(() => {
    if (state.success && !refreshHandledRef.current) {
      refreshHandledRef.current = true
      formRef.current?.reset()
      router.refresh()
      return
    }

    if (!state.success) refreshHandledRef.current = false
  }, [router, state.success])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Total</p>
          <p
            className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl"
            title={formatMoney(totalAmount)}
          >
            {formatMoney(totalAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Paid</p>
          <p
            className="mt-1 text-xl font-bold tabular-nums text-emerald-800 sm:text-2xl"
            title={formatMoney(amountPaid)}
          >
            {formatMoney(amountPaid)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Due</p>
          <p
            className="mt-1 text-xl font-bold tabular-nums text-amber-900 sm:text-2xl"
            title={formatMoney(amountDue)}
          >
            {formatMoney(amountDue)}
          </p>
        </div>
      </div>

      {canRecordPayment && (
        <form ref={formRef} action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <input type="hidden" name="order_id" value={orderId} />
          <h3 className="text-sm font-semibold text-slate-900">Record Payment</h3>

          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</label>
              <Input name="amount" type="number" min="0.01" step="0.01" required className="w-full" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Method</label>
              <select name="method" defaultValue="" className="form-select w-full">
                <option value="">Unspecified</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card">Card</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Note (optional)</label>
            <Input name="note" placeholder="Reference number or memo" className="w-full" />
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.success && state.message && <p className="text-sm text-emerald-700">{state.message}</p>}

          <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
            {isPending ? 'Saving...' : 'Add Payment'}
          </Button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={4}>No payments recorded yet.</td>
                </tr>
              ) : (
                payments.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 text-slate-600">{new Date(row.paid_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatMethod(row.method)}</td>
                    <td className="px-4 py-3 text-slate-600">{row.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {payments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No payments recorded yet.
            </div>
          ) : (
            payments.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{formatMethod(row.method)}</p>
                    <p className="text-xs text-slate-500">{new Date(row.paid_at).toLocaleString()}</p>
                  </div>
                  <p className="text-base font-bold tabular-nums text-slate-900">{formatMoney(row.amount)}</p>
                </div>
                {row.note && <p className="mt-2 text-sm text-slate-600">{row.note}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
