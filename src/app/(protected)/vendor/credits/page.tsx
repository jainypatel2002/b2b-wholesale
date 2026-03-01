import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { computeInvoiceSubtotal } from '@/lib/pricing-engine'
import { computeOrderTotal } from '@/lib/credits/calc'
import { toNumber } from '@/lib/number'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

type OrderAmountRow = {
  id: string
  status: string
  created_at: string
  total_amount: number
  amount_paid: number
  amount_due: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(value) ? value : 0)
}

export default async function VendorBalanceDuePage() {
  const { vendorId, distributorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  if (!distributorId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Balance Due</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">No active distributor selected. Connect to a distributor first.</p>
        </CardContent>
      </Card>
    )
  }

  const [distributorResult, summaryResult, ordersResult, lastPaymentResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name,email')
      .eq('id', distributorId)
      .maybeSingle(),
    supabase.rpc('get_vendor_amount_due', {
      p_distributor_id: distributorId,
      p_vendor_id: vendorId,
    }),
    supabase
      .from('orders')
      .select('id,status,created_at,total_amount,amount_paid,amount_due')
      .eq('vendor_id', vendorId)
      .eq('distributor_id', distributorId)
      .gt('amount_due', 0)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('order_payments')
      .select('paid_at')
      .eq('vendor_id', vendorId)
      .eq('distributor_id', distributorId)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let unpaidOrders: OrderAmountRow[] = []
  let usedFallbackTotals = false

  if (ordersResult.error?.code === '42703') {
    usedFallbackTotals = true
    const fallbackOrders = await supabase
      .from('orders')
      .select(`
        id,
        status,
        created_at,
        amount_paid,
        order_items(qty,unit_price,edited_qty,edited_unit_price,removed),
        order_adjustments(amount),
        order_taxes(type,rate_percent)
      `)
      .eq('vendor_id', vendorId)
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })
      .limit(200)

    unpaidOrders = (fallbackOrders.data ?? [])
      .map((row: any) => {
        const activeItems = (row.order_items ?? []).filter((it: any) => !it.removed)
        const subtotal = computeInvoiceSubtotal(activeItems)
        const adjustmentTotal = (row.order_adjustments ?? []).reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0)
        const totalAmount = computeOrderTotal({
          subtotal,
          adjustmentTotal,
          taxes: row.order_taxes ?? [],
        })
        const amountPaid = Number(row.amount_paid ?? 0)
        const amountDue = Math.max(Number(totalAmount - amountPaid), 0)

        return {
          id: String(row.id),
          status: String(row.status),
          created_at: String(row.created_at),
          total_amount: Number(totalAmount),
          amount_paid: amountPaid,
          amount_due: amountDue,
        }
      })
      .filter((row) => row.amount_due > 0)
  } else {
    unpaidOrders = (ordersResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      status: String(row.status),
      created_at: String(row.created_at),
      total_amount: toNumber(row.total_amount ?? 0, 0),
      amount_paid: toNumber(row.amount_paid ?? 0, 0),
      amount_due: Math.max(toNumber(row.amount_due ?? 0, 0), 0),
    }))
  }

  const summaryRow = Array.isArray(summaryResult.data) ? summaryResult.data[0] : null
  const computedTotalDue = unpaidOrders.reduce((sum, order) => sum + order.amount_due, 0)
  const totalAmountDue = Number(summaryRow?.vendor_total_due ?? computedTotalDue)
  const unpaidOrdersCount = Number(summaryRow?.count_unpaid_orders ?? unpaidOrders.length)
  const lastPaymentDate = summaryRow?.last_payment_date ?? lastPaymentResult.data?.paid_at ?? null

  const distributorName = distributorResult.data?.display_name || distributorResult.data?.email || 'Distributor'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Balance Due</h1>
          <p className="text-sm text-slate-500">Order-linked amount due for {distributorName}.</p>
        </div>
        <Link href="/vendor">
          <Button variant="ghost" size="sm" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Amount Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-amber-900">{formatCurrency(totalAmountDue)}</p>
            <p className="mt-1 text-xs text-slate-500">Current distributor balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">Unpaid Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{unpaidOrdersCount}</p>
            <p className="mt-1 text-xs text-slate-500">Orders with remaining due</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">Last Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base font-semibold text-slate-900">
              {lastPaymentDate ? new Date(lastPaymentDate).toLocaleString() : 'No payments yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Most recent payment from distributor</p>
          </CardContent>
        </Card>
      </div>

      {usedFallbackTotals && (
        <p className="text-xs text-amber-700">
          Running in compatibility mode: stored order receivable columns are unavailable, so totals are computed from order items.
        </p>
      )}

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase text-slate-500">Unpaid / Partially Paid Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {unpaidOrders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No unpaid orders.</td>
                  </tr>
                ) : (
                  unpaidOrders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{order.id.slice(0, 8)}...</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(order.total_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatCurrency(order.amount_paid)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-800">{formatCurrency(order.amount_due)}</td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/vendor/orders/${order.id}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 md:hidden">
        {unpaidOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-slate-500">
            No unpaid orders.
          </div>
        ) : (
          unpaidOrders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-primary">{order.id.slice(0, 8)}...</p>
                    <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="uppercase tracking-wide text-slate-500">Total</p>
                    <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(order.total_amount)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <p className="uppercase tracking-wide text-emerald-700">Paid</p>
                    <p className="font-semibold tabular-nums text-emerald-800">{formatCurrency(order.amount_paid)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2">
                    <p className="uppercase tracking-wide text-amber-700">Due</p>
                    <p className="font-semibold tabular-nums text-amber-900">{formatCurrency(order.amount_due)}</p>
                  </div>
                </div>

                <Link href={`/vendor/orders/${order.id}`}>
                  <Button variant="outline" className="w-full">View Order</Button>
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
