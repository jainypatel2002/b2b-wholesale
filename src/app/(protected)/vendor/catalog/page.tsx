import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { CatalogClient } from './client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

export default async function VendorCatalogPage() {
  const { distributorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  if (!distributorId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="rounded-full bg-slate-100 p-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">Not Linked to a Distributor</h2>
        <p className="mt-2 text-slate-600 max-w-md">
          You need to be linked to a distributor to see their catalog.
        </p>
        <div className="mt-6">
          <Link href="/onboarding">
            <Button>Go to Onboarding</Button>
          </Link>
        </div>
      </div>
    )
  }

  let products: any[] = []
  let errorMsg = ''

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,sell_price,categories(name)')
      .eq('distributor_id', distributorId)
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching products:', error)
      errorMsg = error.message
    } else {
      products = data ?? []
    }
  } catch (err: any) {
    console.error('Unexpected error:', err)
    errorMsg = err.message || 'Unknown error'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Catalog</h1>
        <Link href="/vendor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      {errorMsg && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Error loading catalog</span>
            </div>
            <p className="mt-1 text-sm text-red-600 ml-6">{errorMsg}</p>
          </CardContent>
        </Card>
      )}

      <CatalogClient products={products} />
    </div>
  )
}

