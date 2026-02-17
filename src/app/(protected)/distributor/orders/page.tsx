import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { StatusBadge } from '@/components/status-badge'

export default async function DistributorOrdersPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id,status,created_at,vendor_id,order_items(qty,unit_price)')
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      <div className="card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Order</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Created</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((o: any) => (
                  <tr key={o.id} className="border-t border-slate-200">
                    <td className="py-2">
                      <span className="font-mono text-xs">{o.id.slice(0, 8)}...</span>
                    </td>
                    <td><StatusBadge status={o.status} /></td>
                    <td>
                      {o.invoice ? (
                        <StatusBadge status={o.invoice.payment_status} type="payment" />
                      ) : (
                        <span className="text-slate-400 italic">No invoice</span>
                      )}
                    </td>
                    <td>{o.total.toFixed(2)}</td>
                    <td>{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="text-right">
                      <Link className="btn btn-sm" href={`/distributor/orders/${o.id}`}>Manage</Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td className="py-3 text-slate-600" colSpan={6}>No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
