import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { StatusBadge } from '@/components/status-badge'
import { updateOrderStatus, createInvoiceAction, markInvoicePaid } from '@/app/actions/distributor'
import { FulfillButton } from '@/components/fulfill-button'
import { redirect } from 'next/navigation'

export default async function DistributorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id,status,created_at,vendor_id,order_items(qty,unit_price,unit_cost,products(name))')
    .eq('id', id)
    .eq('distributor_id', distributorId)
    .single()

  if (error) {
    console.error('Error fetching order (distributor):', error)
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link className="link" href="/distributor/orders">← Back</Link>
        <div className="card p-6">
          <h2 className="text-lg font-medium text-red-600">Order not found</h2>
          {error && <p className="mt-2 text-sm text-slate-600">Error: {error.message}</p>}
          <p className="mt-1 text-xs text-slate-400">ID: {id}</p>
        </div>
      </div>
    )
  }

  const subtotal = (order.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
  const profit = (order.order_items ?? []).reduce((sum: number, it: any) => sum + (Number(it.unit_price) - Number(it.unit_cost)) * Number(it.qty), 0)

  const { data: invoice } = await supabase.from('invoices').select('id,invoice_number,payment_status,total').eq('order_id', order.id).maybeSingle()

  // Actions
  async function transitionStatus(newStatus: string) {
    'use server'
    await updateOrderStatus(id, newStatus)
  }

  async function createInvoice() {
    'use server'
    const res = await createInvoiceAction(id)
    if (res.error) {
      console.error(res.error)
      // In a real app we'd show a toast, but for now log it.
    }
  }

  async function markPaid() {
    'use server'
    if (invoice?.id) await markInvoicePaid(invoice.id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link className="link" href="/distributor/orders">← Back</Link>
      </div>

      <div className="card p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-semibold">Order <span className="text-slate-500 text-base font-normal">#{order.id.slice(0, 8)}</span></h1>
            <div className="mt-1 text-sm text-slate-600">Created: {new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div className="text-right space-y-2">
            <div><StatusBadge status={order.status} /></div>
          </div>
        </div>

        {/* Order Workflow Actions */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-b border-slate-100 py-4">
          <span className="text-sm font-medium self-center mr-2">Workflow:</span>

          {order.status === 'placed' && (
            <>
              <form action={transitionStatus.bind(null, 'accepted')}><button className="btn bg-blue-600 text-white hover:bg-blue-700">Accept Order</button></form>
              <form action={transitionStatus.bind(null, 'cancelled')}><button className="btn bg-slate-200 text-slate-800 hover:bg-slate-300">Cancel</button></form>
            </>
          )}


          {order.status === 'accepted' && (
            <>
              <FulfillButton orderId={order.id} />
              <form action={transitionStatus.bind(null, 'cancelled')}><button className="btn bg-slate-200 text-slate-800 hover:bg-slate-300">Cancel</button></form>
            </>
          )}

          {order.status === 'fulfilled' && (
            <span className="text-sm text-green-700 flex items-center">✓ Order Fulfilled</span>
          )}

          {order.status === 'cancelled' && (
            <span className="text-sm text-slate-500">Order is cancelled.</span>
          )}
        </div>

        {/* Invoice Management */}
        <div className="mt-4 flex flex-wrap gap-2 py-2">
          <span className="text-sm font-medium self-center mr-2">Invoice:</span>
          {invoice?.id ? (
            <div className="flex items-center gap-3">
              <Link className="btn btn-outline" href={`/distributor/invoices/${invoice.id}`}>View Invoice {invoice.invoice_number}</Link>
              <StatusBadge status={invoice.payment_status} type="payment" />
              {invoice.payment_status === 'unpaid' && (
                <form action={markPaid}><button className="btn bg-emerald-600 text-white hover:bg-emerald-700">Mark Cash Received</button></form>
              )}
            </div>
          ) : (
            order.status !== 'cancelled' ? (
              <form action={createInvoice}><button className="btn">Create Invoice</button></form>
            ) : (
              <span className="text-sm text-slate-400 italic">Cannot create invoice for cancelled order.</span>
            )
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-medium">Items</h2>
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
        </div>

        <div className="mt-6 grid gap-2 text-sm max-w-xs ml-auto">
          <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="font-medium">{subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Expected profit</span><span className="font-medium text-green-600">{profit.toFixed(2)}</span></div>
        </div>
      </div>
    </div>
  )
}
