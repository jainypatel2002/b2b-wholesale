import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { StatusBadge } from '@/components/status-badge'
import { updateOrderStatus, createInvoiceAction, markInvoicePaid } from '@/app/actions/distributor'
import { FulfillButton } from '@/components/fulfill-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Check, X } from 'lucide-react'
import { GenerateInvoiceButton } from '@/components/generate-invoice-button'

export default async function DistributorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id,status,created_at,vendor_id,vendor:profiles!orders_vendor_id_fkey(display_name,email),order_items(qty,unit_price,unit_cost,products(name))')
    .eq('id', id)
    .eq('distributor_id', distributorId)
    .single()

  if (error) {
    console.error('Error fetching order (distributor):', error)
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/distributor/orders">
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

  // SAFE VENDOR ACCESS (Handle array vs object)
  const vendor = Array.isArray(order.vendor) ? order.vendor[0] : order.vendor

  const subtotal = (order.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)

  const { data: invoice } = await supabase.from('invoices').select('id,invoice_number,payment_status,total').eq('order_id', order.id).maybeSingle()

  // Actions
  async function transitionStatus(newStatus: string) {
    'use server'
    await updateOrderStatus(id, newStatus)
  }

  async function createInvoice() {
    'use server'
    const res = await createInvoiceAction(id)
    if (res.error) {
      console.error(res.error)
    }
  }

  async function markPaid(invoiceId: string) {
    'use server'
    await markInvoicePaid(invoiceId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/distributor/orders">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Order Details</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content: Order Items */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center text-lg">
                <span>Items</span>
                <span className="text-sm font-normal text-slate-500">{order.order_items?.length || 0} items</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.order_items?.map((item: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.products?.name || 'Unknown Product'}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right">${Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${(Number(item.unit_price) * Number(item.qty)).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold">Subtotal</TableCell>
                    <TableCell className="text-right font-bold">${subtotal.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Info & Actions */}
        <div className="space-y-6">
          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-xs text-slate-500 block mb-1">Current Status</span>
                <StatusBadge status={order.status} />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {order.status === 'placed' && (
                  <>
                    <form action={transitionStatus.bind(null, 'accepted')} className="w-full">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700">
                        <Check className="mr-2 h-4 w-4" /> Accept Order
                      </Button>
                    </form>
                    <form action={transitionStatus.bind(null, 'cancelled')} className="w-full">
                      <Button variant="outline" className="w-full text-slate-600">
                        <X className="mr-2 h-4 w-4" /> Cancel
                      </Button>
                    </form>
                  </>
                )}

                {order.status === 'accepted' && (
                  <>
                    <FulfillButton orderId={order.id} />
                    <form action={transitionStatus.bind(null, 'cancelled')} className="w-full">
                      <Button variant="outline" className="w-full text-slate-600">Cancel Order</Button>
                    </form>
                  </>
                )}

                {order.status === 'fulfilled' && (
                  <div className="text-sm text-green-600 font-medium flex items-center">
                    <Check className="mr-2 h-4 w-4" /> Order Fulfilled
                  </div>
                )}
              </div>

              {/* Invoice Actions */}
              <div className="pt-4 mt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500 block mb-2">Invoice</span>
                {invoice ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Link className="text-sm font-mono text-blue-600 hover:underline" href={`/distributor/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                      <StatusBadge status={invoice.payment_status} type="payment" />
                    </div>
                    {invoice.payment_status !== 'paid' && (
                      <form action={markPaid.bind(null, invoice.id)}>
                        <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">Mark Paid (Cash)</Button>
                      </form>
                    )}
                  </div>
                ) : (
                  order.status !== 'cancelled' ? (
                    <GenerateInvoiceButton orderId={order.id} />
                  ) : (
                    <span className="text-xs text-slate-400 italic">No invoice available</span>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customer/Vendor Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Vendor Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-medium text-lg">{vendor?.display_name || 'Unknown'}</div>
              <div className="text-sm text-slate-500">{vendor?.email}</div>
              <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 font-mono break-all">
                Order ID: {order.id}
              </div>
              <div className="text-xs text-slate-400">
                Placed: {new Date(order.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div >
  )
}
