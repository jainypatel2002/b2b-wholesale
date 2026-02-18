import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function ProfitPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id,total,payment_status,created_at,invoice_items(qty,unit_price,unit_cost)')
    .eq('distributor_id', distributorId)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: false })

  const revenue = (invoices ?? []).reduce((sum: number, inv: any) => sum + Number(inv.total), 0)
  const cost = (invoices ?? []).reduce((sum: number, inv: any) => {
    const c = (inv.invoice_items ?? []).reduce((s: number, it: any) => s + Number(it.unit_cost) * Number(it.qty), 0)
    return sum + c
  }, 0)
  const profit = revenue - cost
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Profit & Loss</h1>
        <Link href="/distributor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Revenue (Paid)</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${revenue.toFixed(2)}</div>
            <p className="text-xs text-slate-500">Total collected cash</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Cost (Paid)</CardTitle>
            <TrendingDown className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${cost.toFixed(2)}</div>
            <p className="text-xs text-slate-500">Cost of goods sold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">${profit.toFixed(2)}</div>
            <p className="text-xs text-slate-500">Realized profit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Margin</CardTitle>
            <Receipt className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margin.toFixed(1)}%</div>
            <p className="text-xs text-slate-500">Profit margin</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paid Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices?.length ? (
                invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.id}</TableCell>
                    <TableCell>${Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell>{new Date(inv.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={3} className="h-24 text-center text-slate-500">No paid invoices yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
