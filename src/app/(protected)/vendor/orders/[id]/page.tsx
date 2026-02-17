import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

export default async function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id,status,created_at,order_items(qty,unit_price,products(name))')
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .single()

  if (error) {
    console.error('Error fetching order (vendor):', error)
    console.log('Context:', { vendorId, orderId: id })
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link className="link" href="/vendor/orders">← Back</Link>
        <div className="card p-6">
          <h2 className="text-lg font-medium text-red-600">Order not found</h2>
          {error && <p className="mt-2 text-sm text-slate-600">Error: {error.message}</p>}
          <p className="mt-1 text-xs text-slate-400">ID: {id}</p>
        </div>
      </div>
    )
  }

  const subtotal = (order.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
  const { data: invoice } = await supabase.from('invoices').select('id,invoice_number,payment_status,total').eq('order_id', order.id).maybeSingle()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link className="link" href="/vendor/orders">← Back</Link>
        {invoice?.id && <Link className="btn" href={`/vendor/invoices/${invoice.id}`}>View invoice</Link>}
      </div>

      <div className="card p-6">
        <h1 className="text-xl font-semibold">Order</h1>
        <div className="mt-2 text-sm text-slate-600">{order.id}</div>
        <div className="mt-2 text-sm">Status: <span className="font-medium">{order.status}</span></div>
        <div className="mt-1 text-sm text-slate-600">Created: {new Date(order.created_at).toLocaleString()}</div>

        <h2 className="mt-6 text-lg font-medium">Items</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Product</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {(order.order_items ?? []).map((it: any, idx: number) => (
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

        <div className="mt-6 flex justify-between text-sm">
          <span className="text-slate-600">Subtotal</span>
          <span className="font-medium">{subtotal.toFixed(2)}</span>
        </div>

        {invoice?.id ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            Invoice: <span className="font-medium">{invoice.invoice_number}</span> — {invoice.payment_status}
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-600">Invoice not created yet. Distributor will generate it.</div>
        )}
      </div>
    </div>
  )
}
