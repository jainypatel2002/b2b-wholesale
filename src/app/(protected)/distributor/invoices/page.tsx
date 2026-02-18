import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'

async function markPaid(formData: FormData) {
  'use server'
  const { distributorId } = await getDistributorContext()
  const invoice_id = String(formData.get('invoice_id') || '')
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', invoice_id)
    .eq('distributor_id', distributorId)
  if (error) throw error
}

async function markUnpaid(formData: FormData) {
  'use server'
  const { distributorId } = await getDistributorContext()
  const invoice_id = String(formData.get('invoice_id') || '')
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: 'unpaid', paid_at: null })
    .eq('id', invoice_id)
    .eq('distributor_id', distributorId)
  if (error) throw error
}

export default async function DistributorInvoicesPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id,invoice_number,total,payment_status,created_at,vendor:profiles!invoices_vendor_id_fkey(display_name,email)')
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching invoices:', error)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      <div className="card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Invoice</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices?.length ? (
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-t border-slate-200">
                    <td className="py-2">
                      <Link className="link" href={`/distributor/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td>
                      {inv.vendor?.display_name || inv.vendor?.email || <span className="text-slate-400">Unknown Vendor</span>}
                    </td>
                    <td>{inv.payment_status}</td>
                    <td>{Number(inv.total).toFixed(2)}</td>
                    <td className="space-x-2">
                      {inv.payment_status === 'paid' ? (
                        <form action={markUnpaid} className="inline">
                          <input type="hidden" name="invoice_id" value={inv.id} />
                          <button className="btn" type="submit">Mark unpaid</button>
                        </form>
                      ) : (
                        <form action={markPaid} className="inline">
                          <input type="hidden" name="invoice_id" value={inv.id} />
                          <button className="btn" type="submit">Mark paid (cash)</button>
                        </form>
                      )}
                    </td>
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
