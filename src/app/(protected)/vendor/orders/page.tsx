import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <Link className="link" href="/vendor">← Back</Link>
      </div>

      <div className="card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((o: any) => (
                  <tr key={o.id} className="border-t border-slate-200">
                    <td className="py-2">
                      <Link className="link font-mono text-xs" href={`/vendor/orders/${o.id}`}>{o.id}</Link>
                    </td>
                    <td>{o.status}</td>
                    <td>{o.total.toFixed(2)}</td>
                    <td>{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr><td className="py-3 text-slate-600" colSpan={4}>No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
