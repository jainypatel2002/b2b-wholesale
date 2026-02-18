
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export default async function DistributorOrdersPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id,status,created_at,vendor_id,vendor:profiles!orders_vendor_id_fkey(display_name,email),order_items(qty,unit_price)')
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false })

  // Fetch invoices to map payment status
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id,order_id,payment_status')
    .eq('distributor_id', distributorId)

  const invoiceMap = new Map(invoices?.map((i) => [i.order_id, i]))

  const rows = (orders ?? []).map((o: any) => {
    const total = (o.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
    const invoice = invoiceMap.get(o.id)
    return { ...o, total, invoice }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {o.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{o.vendor?.display_name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{o.vendor?.email}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell>
                      {o.invoice ? (
                        <StatusBadge status={o.invoice.payment_status} type="payment" />
                      ) : (
                        <span className="text-slate-400 italic text-xs">No invoice</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">${o.total.toFixed(2)}</TableCell>
                    <TableCell className="text-slate-500">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/distributor/orders/${o.id}`}>
                        <Button variant="outline" size="sm">Manage</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

