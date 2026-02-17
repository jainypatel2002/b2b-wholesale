import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function VendorHome() {
  const profile = await requireRole('vendor')
  const supabase = await createClient()
  const { data: link } = await supabase
    .from('distributor_vendors')
    .select('distributor_id')
    .eq('vendor_id', profile.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Vendor Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Connected distributor:</p>
        <div className="mt-2 rounded-xl bg-slate-50 p-3 font-mono text-sm break-all">{link?.distributor_id ?? 'Not linked'}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link className="card p-6 hover:shadow" href="/vendor/catalog">
          <div className="text-lg font-medium">Catalog</div>
          <div className="text-sm text-slate-600">Browse products and add to cart.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/vendor/cart">
          <div className="text-lg font-medium">Cart</div>
          <div className="text-sm text-slate-600">Place an order.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/vendor/orders">
          <div className="text-lg font-medium">Orders</div>
          <div className="text-sm text-slate-600">View your order history.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/vendor/invoices">
          <div className="text-lg font-medium">Invoices</div>
          <div className="text-sm text-slate-600">Cash due / paid invoices.</div>
        </Link>
      </div>
    </div>
  )
}
