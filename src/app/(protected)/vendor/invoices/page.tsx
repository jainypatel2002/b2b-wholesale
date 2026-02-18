import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function VendorInvoicesPage() {
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id,invoice_number,total,payment_status,created_at,distributor:profiles!invoices_distributor_id_fkey(display_name,email)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <Link href="/vendor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Distributor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices?.length ? (
                invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <Link href={`/vendor/invoices/${inv.id}`} className="hover:underline text-blue-600">
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {inv.distributor?.display_name || inv.distributor?.email || <span className="text-slate-400">Unknown</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={inv.payment_status} type="payment" /></TableCell>
                    <TableCell>${Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">No invoices yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
