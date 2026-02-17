import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profit</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-5">
          <div className="text-sm text-slate-600">Revenue (paid)</div>
          <div className="mt-1 text-2xl font-semibold">{revenue.toFixed(2)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-slate-600">Cost (paid)</div>
          <div className="mt-1 text-2xl font-semibold">{cost.toFixed(2)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-slate-600">Profit (paid)</div>
          <div className="mt-1 text-2xl font-semibold">{profit.toFixed(2)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-slate-600">Margin</div>
          <div className="mt-1 text-2xl font-semibold">{margin.toFixed(1)}%</div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-medium">Paid invoices</h2>
        <p className="mt-1 text-sm text-slate-600">Profit is counted only when invoice is marked paid (cash collected).</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Invoice ID</th>
                <th>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices?.length ? (
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-t border-slate-200">
                    <td className="py-2 font-mono text-xs">{inv.id}</td>
                    <td>{Number(inv.total).toFixed(2)}</td>
                    <td>{new Date(inv.created_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr><td className="py-3 text-slate-600" colSpan={3}>No paid invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
