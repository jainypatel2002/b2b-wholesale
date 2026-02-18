import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function VendorOrdersPage() {
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id,status,created_at,order_items(qty,unit_price)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  const rows = (orders ?? []).map((o: any) => {
    const total = (o.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
    return { ...o, total }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Order History</h1>
        <Link href="/vendor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <Link href={`/vendor/orders/${o.id}`} className="hover:underline text-blue-600">
                        {o.id.slice(0, 8)}...
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell>${o.total.toFixed(2)}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/vendor/orders/${o.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">No orders yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
