import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

export default async function VendorInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id,invoice_number,created_at,payment_status,paid_at,subtotal,tax,total,invoice_items(qty,unit_price,products(name))')
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .single()

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Link className="link" href="/vendor/invoices">← Back</Link>
        <div className="card p-6">Invoice not found.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link className="link" href="/vendor/invoices">← Back</Link>
        <Link className="btn btn-outline" href={`/vendor/invoices/${id}/print`} target="_blank">Print Invoice</Link>
      </div>

      <div className="card p-6">
        <h1 className="text-2xl font-semibold">{invoice.invoice_number}</h1>
        <div className="mt-1 text-sm text-slate-600">Created: {new Date(invoice.created_at).toLocaleString()}</div>
        <div className="mt-1 text-sm">Status: <span className="font-medium">{invoice.payment_status}</span></div>
        {invoice.paid_at && <div className="mt-1 text-sm text-slate-600">Paid at: {new Date(invoice.paid_at).toLocaleString()}</div>}

        <h2 className="mt-6 text-lg font-medium">Items</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Product</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.invoice_items ?? []).map((it: any, idx: number) => (
                <tr key={idx} className="border-t border-slate-200">
                  <td className="py-2">{it.products?.name ?? '-'}</td>
                  <td>{it.qty}</td>
                  <td>{Number(it.unit_price).toFixed(2)}</td>
                  <td>{(Number(it.unit_price) * Number(it.qty)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="font-medium">{Number(invoice.subtotal).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Tax</span><span className="font-medium">{Number(invoice.tax).toFixed(2)}</span></div>
          <div className="flex justify-between text-base"><span className="font-medium">Total</span><span className="font-semibold">{Number(invoice.total).toFixed(2)}</span></div>
        </div>

        <p className="mt-4 text-xs text-slate-500">Payment method: cash</p>
      </div>
    </div>
  )
}
