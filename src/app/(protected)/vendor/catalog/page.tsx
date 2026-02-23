export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { CategoriesClient } from './categories-client'
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

  let categories: any[] = []
  let errorMsg = ''

  try {
    // 1. Fetch categories
    const { data: categoriesData, error: catError } = await supabase
      .from('categories')
      .select('id, name, is_active, deleted_at')
      .eq('distributor_id', distributorId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')

    if (catError) throw catError

    // 2. Fetch product counts securely using the new RPC Engine
    // This ensures counts only reflect products the vendor actively has access to
    const { data: rpcData, error: prodError } = await supabase
      .rpc('get_vendor_catalog_prices', {
        p_distributor_id: distributorId
      })

    let productsData: any[] = []

    if (prodError) {
      if (prodError.code === 'PGRST202') {
        console.warn('RPC get_vendor_catalog_prices not found, falling back to direct query')
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('products')
          .select('id, category_id')
          .eq('distributor_id', distributorId)
          .is('deleted_at', null)

        if (fallbackError) throw fallbackError
        productsData = fallbackData || []
      } else {
        throw prodError
      }
    } else {
      productsData = rpcData || []
    }

    // Combine
    const counts = (productsData || []).reduce((acc: any, p: any) => {
      if (p.category_id) {
        acc[p.category_id] = (acc[p.category_id] || 0) + 1
      }
      return acc
    }, {})

    categories = (categoriesData || []).map((c: any) => ({
      ...c,
      product_count: counts[c.id] || 0
    }))

  } catch (err: any) {
    console.error('Error fetching catalog:', err)
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

      <CategoriesClient categories={categories} />
    </div>
  )
}

