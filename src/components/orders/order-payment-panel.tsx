'use client'

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  initialOrderPaymentActionState,
  recordOrderPaymentAction,
} from '@/app/actions/order-payments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/ui/money'

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

const MAX_PAYMENT_AMOUNT = 1_000_000
const PAYMENT_AMOUNT_INPUT_REGEX = /^(?:\d+)(?:\.\d{0,2})?$/

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(amount) ? amount : 0)
}

function formatMethod(method: string | null): string {
  if (!method) return 'Unspecified'
  return method
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function validatePaymentAmount(rawValue: string, dueAmount: number): string | null {
  const value = rawValue.trim()
  if (!value) return 'Amount is required.'
  if (!PAYMENT_AMOUNT_INPUT_REGEX.test(value)) {
    return 'Enter a valid amount with up to 2 decimals.'
  }

  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Enter a valid amount.'
  if (amount <= 0) return 'Amount must be greater than 0.'
  if (amount > MAX_PAYMENT_AMOUNT) {
    return `Amount must be ${formatCurrency(MAX_PAYMENT_AMOUNT)} or less.`
  }
  if (dueAmount <= 0) return 'This order is already fully paid.'
  if (amount > dueAmount + 0.01) {
    return `Amount cannot exceed current due (${formatCurrency(dueAmount)}).`
  }

  return null
}

class OrderPaymentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Order payment panel render failure:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Payment widget failed to render. Refresh the page and try again.
        </div>
      )
    }

    return this.props.children
  }
}

function SafeDateLabel({ iso }: { iso: string }) {
  if (!iso || iso === 'undefined' || iso === 'null') return <span className="text-slate-400">—</span>
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return <span className="text-slate-400">—</span>
  return <span>{d.toLocaleString('en-US')}</span>
}

function OrderPaymentPanelInner({
  orderId,
  totalAmount,
  amountPaid,
  amountDue,
  payments,
  canRecordPayment = false,
}: OrderPaymentPanelProps) {
  const router = useRouter()
  const refreshHandledRef = useRef(false)
  const [amountInput, setAmountInput] = useState('')
  const [methodInput, setMethodInput] = useState('unspecified')
  const [noteInput, setNoteInput] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const [touchedAmount, setTouchedAmount] = useState(false)
  const [state, formAction, isPending] = useActionState(
    recordOrderPaymentAction,
    initialOrderPaymentActionState,
  )

  const amountError = (touchedAmount || amountInput.trim() !== '')
    ? validatePaymentAmount(amountInput, amountDue)
    : null
  const noteError = noteInput.length > 500 ? 'Note cannot exceed 500 characters.' : null
  const submitBlocked = isPending || amountDue <= 0 || !!amountError || !!noteError

  useEffect(() => {
    if (state.success && !refreshHandledRef.current) {
      refreshHandledRef.current = true
      setAmountInput('')
      setMethodInput('unspecified')
      setNoteInput('')
      setClientError(null)
      setTouchedAmount(false)
      router.refresh()
      return
    }

    if (!state.success) refreshHandledRef.current = false
  }, [router, state.success])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 min-w-0 flex flex-col justify-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">Total</p>
          <div className="mt-1 w-full min-w-0">
            <Money amount={totalAmount} className="text-xl font-bold text-slate-900 sm:text-2xl block w-full" />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 min-w-0 flex flex-col justify-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700 truncate">Paid</p>
          <div className="mt-1 w-full min-w-0">
            <Money amount={amountPaid} className="text-xl font-bold text-emerald-800 sm:text-2xl block w-full" />
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 min-w-0 flex flex-col justify-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700 truncate">Due</p>
          <div className="mt-1 w-full min-w-0">
            <Money amount={amountDue} className="text-xl font-bold text-amber-900 sm:text-2xl block w-full" />
          </div>
        </div>
      </div>

      {canRecordPayment && (
        <form
          action={formAction}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            setTouchedAmount(true)
            const validationError = validatePaymentAmount(amountInput, amountDue)
            if (validationError) {
              event.preventDefault()
              setClientError(validationError)
              return
            }
            if (noteInput.length > 500) {
              event.preventDefault()
              setClientError('Note cannot exceed 500 characters.')
              return
            }
            setClientError(null)
          }}
        >
          <input type="hidden" name="order_id" value={orderId} />
          <h3 className="text-sm font-semibold text-slate-900">Record Payment</h3>

          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</label>
              <Input
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(event) => {
                  setTouchedAmount(true)
                  setAmountInput(event.target.value)
                  if (clientError) setClientError(null)
                }}
                autoComplete="off"
                required
                className="w-full"
              />
              {amountError && <p className="text-xs text-red-600">{amountError}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Method</label>
              <select
                name="method"
                value={methodInput}
                onChange={(event) => setMethodInput(event.target.value)}
                className="form-select w-full"
              >
                <option value="unspecified">Unspecified</option>
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
            <Input
              name="note"
              placeholder="Reference number or memo"
              value={noteInput}
              onChange={(event) => {
                setNoteInput(event.target.value)
                if (clientError) setClientError(null)
              }}
              className="w-full"
              maxLength={500}
            />
            {noteError && <p className="text-xs text-red-600">{noteError}</p>}
          </div>

          {amountDue <= 0 && (
            <p className="text-xs text-slate-500">
              This order is already fully paid.
            </p>
          )}

          {(clientError || state.error) && <p className="text-sm text-red-600">{clientError || state.error}</p>}
          {state.success && state.message && <p className="text-sm text-emerald-700">{state.message}</p>}

          <Button type="submit" className="w-full sm:w-auto" disabled={submitBlocked}>
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
                    <td className="px-4 py-3 text-slate-600"><SafeDateLabel iso={row.paid_at} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      <Money amount={row.amount} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatMethod(row.method)}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={row.note || ''}>{row.note || '—'}</td>
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
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-500 truncate">{formatMethod(row.method)}</p>
                    <p className="text-xs text-slate-500 truncate"><SafeDateLabel iso={row.paid_at} /></p>
                  </div>
                  <div className="flex-shrink-0">
                    <Money amount={row.amount} className="text-base font-bold text-slate-900" />
                  </div>
                </div>
                {row.note && <p className="mt-2 text-sm text-slate-600 break-words line-clamp-2" title={row.note}>{row.note}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export function OrderPaymentPanel(props: OrderPaymentPanelProps) {
  return (
    <OrderPaymentErrorBoundary>
      <OrderPaymentPanelInner {...props} />
    </OrderPaymentErrorBoundary>
  )
}
