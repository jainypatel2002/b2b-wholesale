import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShoppingCart, Package, FileText, LayoutGrid, Link as LinkIcon } from 'lucide-react'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Vendor Dashboard</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-medium text-slate-500">Connected Distributor</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono tracking-tight">{link?.distributor_id ?? 'Not linked'}</div>
          <p className="text-xs text-slate-500 mt-1">Your primary distributor ID</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/vendor/catalog">
          <Card className="h-full hover:bg-slate-50 transition-colors cursor-pointer border-slate-200 hover:border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutGrid className="h-5 w-5 text-blue-500" /> Catalog
              </CardTitle>
              <CardDescription>Browse products</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/vendor/cart">
          <Card className="h-full hover:bg-slate-50 transition-colors cursor-pointer border-slate-200 hover:border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5 text-blue-500" /> Cart
              </CardTitle>
              <CardDescription>View your cart</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/vendor/orders">
          <Card className="h-full hover:bg-slate-50 transition-colors cursor-pointer border-slate-200 hover:border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-blue-500" /> Orders
              </CardTitle>
              <CardDescription>Order history</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/vendor/invoices">
          <Card className="h-full hover:bg-slate-50 transition-colors cursor-pointer border-slate-200 hover:border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-blue-500" /> Invoices
              </CardTitle>
              <CardDescription>View invoices</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
