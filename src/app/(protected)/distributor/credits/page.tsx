import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { toNumber } from '@/lib/number'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'

export const dynamic = 'force-dynamic'

type OrderAmountRow = {
  id: string
  status: string
  created_at: string
  total_amount: number
  amount_paid: number
  amount_due: number
  last_payment_at: string | null
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(value) ? value : 0)
}

export default async function DistributorAmountDuePage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>
}) {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()
  const { vendor: vendorParam } = await searchParams
  const vendors = await getLinkedVendors(distributorId)

  const selectedVendorId = vendors.some((vendor) => vendor.id === vendorParam)
    ? String(vendorParam)
    : (vendors[0]?.id || '')
  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId)

  if (!selectedVendorId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Amount Due</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">No linked vendors found. Link a vendor first.</p>
        </CardContent>
      </Card>
    )
  }

  let summaryRowsResult: any = { data: null, error: null }
  let lastPaymentResult: any = { data: null, error: null }
  let summaryLoadError: string | null = null

  try {
    const [summaryRes, pRes] = await Promise.all([
      supabase
        .from('order_payment_summary')
        .select('order_id,order_status,order_created_at,order_total,paid_total,due_total,last_payment_at,payment_count')
        .eq('distributor_id', distributorId)
        .eq('vendor_id', selectedVendorId)
        .order('order_created_at', { ascending: false }),
      supabase
        .from('order_payment_summary')
        .select('last_payment_at')
        .eq('distributor_id', distributorId)
        .eq('vendor_id', selectedVendorId)
        .not('last_payment_at', 'is', null)
        .order('last_payment_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    summaryRowsResult = summaryRes
    lastPaymentResult = pRes
  } catch (err) {
    console.error('SSR Exception in Amount Due page (distributor):', err)
    summaryLoadError = 'Failed to load amount due summary. Please refresh and try again.'
  }

  if (summaryRowsResult.error) {
    console.error('Amount due summary query error (distributor):', summaryRowsResult.error)
    summaryLoadError = summaryLoadError || summaryRowsResult.error.message || 'Failed to load amount due summary.'
  }

  const summaryRows: Array<Record<string, unknown>> = Array.isArray(summaryRowsResult.data)
    ? summaryRowsResult.data as Array<Record<string, unknown>>
    : []

  const allOrders: OrderAmountRow[] = summaryRows.map((row) => ({
    id: String(row.order_id),
    status: String(row.order_status ?? 'placed'),
    created_at: String(row.order_created_at ?? ''),
    total_amount: Math.max(toNumber(row.order_total, 0), 0),
    amount_paid: Math.max(toNumber(row.paid_total, 0), 0),
    amount_due: Math.max(toNumber(row.due_total, 0), 0),
    last_payment_at: row.last_payment_at == null ? null : String(row.last_payment_at),
  }))

  const unpaidOrders: OrderAmountRow[] = allOrders.filter((row) => row.amount_due > 0)
  const totalAmountDue = unpaidOrders.reduce((sum, order) => sum + order.amount_due, 0)
  const unpaidOrdersCount = unpaidOrders.length
  const derivedLastPayment = allOrders.reduce<string | null>((latest, row) => {
    if (!row.last_payment_at) return latest
    if (!latest) return row.last_payment_at
    return new Date(row.last_payment_at).getTime() > new Date(latest).getTime() ? row.last_payment_at : latest
  }, null)
  const lastPaymentDate = lastPaymentResult.data?.last_payment_at ?? derivedLastPayment

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Amount Due</h1>
          <p className="text-sm text-slate-500">Order-linked receivables for each vendor.</p>
        </div>
        <form action="/distributor/credits" className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</label>
            <select name="vendor" defaultValue={selectedVendorId} className="form-select min-w-[220px]">
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Load</Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Amount Due</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <p className="text-2xl font-bold tabular-nums text-amber-900 truncate" title={formatCurrency(totalAmountDue)}>{formatCurrency(totalAmountDue)}</p>
            <p className="mt-1 text-xs text-slate-500">{selectedVendor?.name || 'Vendor'}</p>
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
            <p className="mt-1 text-xs text-slate-500">Most recent recorded payment</p>
          </CardContent>
        </Card>
      </div>

      {summaryLoadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {summaryLoadError}
        </p>
      )}

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase text-slate-500">Unpaid / Partially Paid Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
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
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No unpaid orders for this vendor.</td>
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
                        <Link href={`/distributor/orders/${order.id}`}>
                          <Button variant="outline" size="sm">Manage</Button>
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
            No unpaid orders for this vendor.
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
                  <div className="rounded-lg bg-slate-50 p-2 min-w-0">
                    <p className="uppercase tracking-wide text-slate-500 text-xs truncate">Total</p>
                    <p className="font-semibold tabular-nums text-slate-900 truncate" title={formatCurrency(order.total_amount)}>{formatCurrency(order.total_amount)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2 min-w-0">
                    <p className="uppercase tracking-wide text-emerald-700 text-xs truncate">Paid</p>
                    <p className="font-semibold tabular-nums text-emerald-800 truncate" title={formatCurrency(order.amount_paid)}>{formatCurrency(order.amount_paid)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2 min-w-0">
                    <p className="uppercase tracking-wide text-amber-700 text-xs truncate">Due</p>
                    <p className="font-semibold tabular-nums text-amber-900 truncate" title={formatCurrency(order.amount_due)}>{formatCurrency(order.amount_due)}</p>
                  </div>
                </div>

                <Link href={`/distributor/orders/${order.id}`}>
                  <Button variant="outline" className="w-full">Manage Order</Button>
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
