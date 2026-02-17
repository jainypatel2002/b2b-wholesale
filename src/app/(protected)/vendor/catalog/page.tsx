import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { CatalogClient } from './client'

export default async function VendorCatalogPage() {
  const { distributorId } = await getVendorContext({ strict: false })
  const supabase = await createClient()

  if (!distributorId) {
    return (
      <div className="card p-6 text-center">
        <h2 className="text-xl font-semibold text-slate-800">Not Linked to a Distributor</h2>
        <p className="mt-2 text-slate-600">
          You need to be linked to a distributor to see their catalog.
        </p>
        <div className="mt-6">
          <Link href="/onboarding" className="btn btn-primary">
            Go to Onboarding
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalog</h1>
        <Link className="link" href="/vendor">← Back</Link>
      </div>

      {errorMsg && (
        <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-md">
          Error loading catalog: {errorMsg}
        </div>
      )}

      <CatalogClient products={products} />
    </div>
  )
}

