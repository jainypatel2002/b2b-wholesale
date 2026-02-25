import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShoppingCart, Package, FileText, LayoutGrid, Link as LinkIcon, Save } from 'lucide-react'
import { VendorInsightsPanel } from '@/components/vendor/vendor-insights-panel'

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

  let autosaveDraft: { id: string; updated_at: string } | null = null
  if (distributorId) {
    const draftResult = await supabase
      .from('vendor_draft_orders')
      .select('id,updated_at')
      .eq('vendor_id', profile.id)
      .eq('distributor_id', distributorId)
      .eq('status', 'draft')
      .is('name', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!draftResult.error && draftResult.data?.id) {
      autosaveDraft = {
        id: draftResult.data.id,
        updated_at: String(draftResult.data.updated_at || '')
      }
    }
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

      {autosaveDraft && (
        <Link href={`/vendor/cart?resumeDraftId=${encodeURIComponent(autosaveDraft.id)}`}>
          <Card className="cursor-pointer border-emerald-200 bg-emerald-50/60 transition-colors hover:bg-emerald-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
                <Save className="h-5 w-5" />
                Continue Draft
              </CardTitle>
              <CardDescription className="text-emerald-800/80">
                Autosave updated {new Date(autosaveDraft.updated_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      )}

      <VendorInsightsPanel distributorId={distributorId} />
    </div>
  )
}
