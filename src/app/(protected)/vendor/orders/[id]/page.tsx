import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText } from 'lucide-react'
import { normalizeInvoiceItem, computeInvoiceSubtotal, formatMoney } from '@/lib/pricing-engine'
import { computeOrderTotal } from '@/lib/credits/calc'
import { OrderPaymentPanel } from '@/components/orders/order-payment-panel'

export default async function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const fullSelect = `
    id, status, created_at, vendor_note, created_by_role, created_source,
    total_amount, amount_paid, amount_due,
    order_items(
      id, qty, unit_price, product_name, order_unit, units_per_case_snapshot,
      products(name),
      edited_name, edited_unit_price, edited_qty, removed
    ),
    order_adjustments(id, name, amount),
    order_taxes(id, name, type, rate_percent)
  `
  const fallbackSelect = `
    id, status, created_at,
    vendor_note, created_by_role, created_source,
    order_items(
      id, qty, unit_price, product_name, order_unit, units_per_case_snapshot,
      products(name),
      edited_name, edited_unit_price, edited_qty, removed
    ),
    order_adjustments(id, name, amount),
    order_taxes(id, name, type, rate_percent)
  `

  let order: any = null
  let error: any = null

  const fullResult = await supabase
    .from('orders')
    .select(fullSelect)
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .single()

  order = fullResult.data
  error = fullResult.error

  if (error && error.code === '42703') {
    const fallback = await supabase
      .from('orders')
      .select(fallbackSelect)
      .eq('id', id)
      .eq('vendor_id', vendorId)
      .single()
    order = fallback.data
    error = fallback.error
  }

  if (error) {
    console.error('Error fetching order (vendor):', error)
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/vendor/orders">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders</Button>
        </Link>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <h2 className="text-lg font-medium text-red-800">Order not found</h2>
            {error && <p className="mt-2 text-sm text-red-600">Error: {error.message}</p>}
            <p className="mt-1 text-xs text-red-400 font-mono">ID: {id}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const activeItems = (order.order_items ?? []).filter((it: any) => !it.removed)
  const subtotal = computeInvoiceSubtotal(activeItems)
  const adjustmentTotal = (order.order_adjustments ?? []).reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0)
  const computedTotal = computeOrderTotal({
    subtotal,
    adjustmentTotal,
    taxes: order.order_taxes ?? [],
  })

  const totalAmount = Number(order.total_amount ?? computedTotal ?? 0)
  const amountPaid = Number(order.amount_paid ?? 0)
  const amountDue = Math.max(Number(order.amount_due ?? (totalAmount - amountPaid) ?? 0), 0)

  const [invoiceResult, paymentsResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('id,invoice_number,payment_status,total')
      .eq('order_id', order.id)
      .maybeSingle(),
    supabase
      .from('order_payments')
      .select('id,amount,method,note,paid_at,created_at')
      .eq('order_id', order.id)
      .eq('vendor_id', vendorId)
      .order('paid_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const invoice = invoiceResult.data
  const paymentsFeatureUnavailable = paymentsResult.error?.code === '42P01'
  const payments = (
    paymentsFeatureUnavailable
      ? []
      : (paymentsResult.data ?? [])
  ).map((row: any) => ({
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    method: row.method == null ? null : String(row.method),
    note: row.note == null ? null : String(row.note),
    paid_at: String(row.paid_at || row.created_at),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/vendor/orders">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Order Details</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center text-lg">
                <span>Items</span>
                <span className="text-sm font-normal text-slate-500">{activeItems.length} items</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeItems.map((rawItem: any) => {
                    const item = normalizeInvoiceItem(rawItem)
                    const effectivePrice = item.mode === 'case' ? item.casePrice : item.unitPrice
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">
                            {item.qty} {item.mode === 'case' ? (item.qty === 1 ? 'case' : 'cases') : (item.qty === 1 ? 'unit' : 'units')}
                          </div>
                          {item.mode === 'case' && item.unitsPerCase > 0 && (
                            <div className="text-[10px] text-slate-400">@ {item.unitsPerCase}/case</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatMoney(effectivePrice)}
                          <span className="text-[10px] text-slate-400 ml-1">/ {item.mode === 'case' ? 'case' : 'unit'}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(item.lineTotal)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">{formatMoney(subtotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {order.vendor_note && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase text-slate-500">Your Note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">{order.vendor_note}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 block mb-1">Status</span>
                <StatusBadge status={order.status} />
              </div>
              <div>
                <span className="text-xs text-slate-500 block mb-1">Order Date</span>
                <div className="text-sm">{new Date(order.created_at).toLocaleString()}</div>
              </div>
              {order.created_by_role === 'distributor' && (
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Created By</span>
                  <div className="text-sm">Distributor {order.created_source ? `(${order.created_source})` : ''}</div>
                </div>
              )}
              <div className="text-xs text-slate-400 font-mono break-all pt-2">
                ID: {order.id}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Balance</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsFeatureUnavailable ? (
                <p className="text-xs text-amber-700">
                  Payment details are unavailable in this environment. Ask your distributor to apply the latest migration.
                </p>
              ) : (
                <OrderPaymentPanel
                  orderId={order.id}
                  totalAmount={totalAmount}
                  amountPaid={amountPaid}
                  amountDue={amountDue}
                  payments={payments}
                  canRecordPayment={false}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Invoice</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice?.id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Link className="flex items-center gap-2 text-sm font-mono text-primary hover:underline" href={`/vendor/invoices/${invoice.id}`}>
                      <FileText className="h-4 w-4" />
                      {invoice.invoice_number}
                    </Link>
                    <StatusBadge status={invoice.payment_status} type="payment" />
                  </div>
                  <Link href={`/vendor/invoices/${invoice.id}`} className="block w-full">
                    <Button variant="outline" size="sm" className="w-full">View Invoice</Button>
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Invoice not yet generated.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
