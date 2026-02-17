import Link from 'next/link'
import { requireRole } from '@/lib/auth'

export default async function DistributorHome() {
  const profile = await requireRole('distributor')

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Distributor Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Your distributor code (share with vendors):</p>
        <div className="mt-2 rounded-xl bg-slate-50 p-3 font-mono text-sm break-all">{profile.id}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link className="card p-6 hover:shadow" href="/distributor/categories">
          <div className="text-lg font-medium">Categories</div>
          <div className="text-sm text-slate-600">Create categories like Tobacco, Gummies, etc.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/distributor/inventory">
          <div className="text-lg font-medium">Inventory</div>
          <div className="text-sm text-slate-600">Add products, costs, prices, stock.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/distributor/orders">
          <div className="text-lg font-medium">Orders</div>
          <div className="text-sm text-slate-600">View vendor orders and order details.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/distributor/invoices">
          <div className="text-lg font-medium">Invoices</div>
          <div className="text-sm text-slate-600">Create invoices, mark cash paid/unpaid.</div>
        </Link>
        <Link className="card p-6 hover:shadow" href="/distributor/profit">
          <div className="text-lg font-medium">Profit</div>
          <div className="text-sm text-slate-600">Revenue, cost, profit, margin.</div>
        </Link>
      </div>
    </div>
  )
}
