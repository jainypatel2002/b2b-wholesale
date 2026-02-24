import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShoppingCart, Package, FileText, LayoutGrid, Link as LinkIcon } from 'lucide-react'

export default async function VendorHome() {
  const profile = await requireRole('vendor')
  const { distributorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  // Fetch active distributor details
  let activeDistributorName = 'None'
  if (distributorId) {
    const { data } = await supabase.from('profiles').select('display_name, email').eq('id', distributorId).single()
    if (data) activeDistributorName = data.display_name || data.email || 'Unknown'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Vendor Dashboard</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-medium text-slate-500">Active Distributor</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono tracking-tight">{activeDistributorName}</div>
          <p className="text-xs text-slate-500 mt-1">Currently browsing catalog for this distributor</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/vendor/catalog">
          <Card className="h-full cursor-pointer border-white/70 bg-white/80 transition-colors hover:bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutGrid className="h-5 w-5 text-primary" /> Catalog
              </CardTitle>
              <CardDescription>Browse products</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/vendor/cart">
          <Card className="h-full cursor-pointer border-white/70 bg-white/80 transition-colors hover:bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5 text-primary" /> Cart
              </CardTitle>
              <CardDescription>View your cart</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/vendor/orders">
          <Card className="h-full cursor-pointer border-white/70 bg-white/80 transition-colors hover:bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-primary" /> Orders
              </CardTitle>
              <CardDescription>Order history</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/vendor/invoices">
          <Card className="h-full cursor-pointer border-white/70 bg-white/80 transition-colors hover:bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" /> Invoices
              </CardTitle>
              <CardDescription>View invoices</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
