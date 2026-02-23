import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText } from 'lucide-react'
import { formatPriceLabel, formatQtyLabel } from '@/lib/pricing-engine'

export default async function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, status, created_at,
      order_items(
        id, qty, unit_price, product_name, order_unit, units_per_case_snapshot,
        products(name),
        edited_name, edited_unit_price, edited_qty, removed
      )
    `)
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .single()

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

  // Use effective values (edited if present, else original), exclude removed
  const activeItems = (order.order_items ?? []).filter((it: any) => !it.removed)
  const subtotal = activeItems.reduce((sum: number, it: any) => {
    const price = it.edited_unit_price ?? it.unit_price
    const qty = it.edited_qty ?? it.qty
    return sum + Number(price) * Number(qty)
  }, 0)

  const { data: invoice } = await supabase.from('invoices').select('id,invoice_number,payment_status,total').eq('order_id', order.id).maybeSingle()

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
        {/* Main Content: Items */}
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
                  {activeItems.map((it: any) => {
                    const productName = it.edited_name ?? it.product_name ?? (Array.isArray(it.products) ? it.products[0]?.name : it.products?.name) ?? '(Archived Product)'
                    const effectivePrice = Number(it.edited_unit_price ?? it.unit_price)
                    const effectiveQty = Number(it.edited_qty ?? it.qty)
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{productName}</TableCell>
                        <TableCell className="text-right">
                          {formatQtyLabel(effectiveQty, it.order_unit)}
                          {it.order_unit === 'case' && (it.units_per_case_snapshot ?? 0) > 0 && (
                            <div className="text-[10px] text-slate-400">@ {it.units_per_case_snapshot}/case</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPriceLabel(effectivePrice, it.order_unit)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${(effectivePrice * effectiveQty).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">${subtotal.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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
              <div className="text-xs text-slate-400 font-mono break-all pt-2">
                ID: {order.id}
              </div>
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
                    <Link className="text-sm font-mono text-blue-600 hover:underline flex items-center gap-2" href={`/vendor/invoices/${invoice.id}`}>
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
