import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

export default async function VendorInvoicesPage() {
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id,invoice_number,total,payment_status,created_at,distributor:profiles!invoices_distributor_id_fkey(display_name,email)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Link className="link" href="/vendor">← Back</Link>
      </div>

      <div className="card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Invoice</th>
                <th>Distributor</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices?.length ? (
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-t border-slate-200">
                    <td className="py-2">
                      <Link className="link" href={`/vendor/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td>
                      {inv.distributor?.display_name || inv.distributor?.email || <span className="text-slate-400">Unknown</span>}
                    </td>
                    <td>{inv.payment_status}</td>
                    <td>{Number(inv.total).toFixed(2)}</td>
                    <td>{new Date(inv.created_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr><td className="py-3 text-slate-600" colSpan={5}>No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
