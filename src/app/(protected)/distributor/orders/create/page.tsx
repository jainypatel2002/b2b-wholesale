import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { DistributorCreateOrderClient } from './ui'

export const dynamic = 'force-dynamic'

export default async function DistributorCreateOrderPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const [vendors, productsResult] = await Promise.all([
    getLinkedVendors(distributorId),
    supabase
      .from('products')
      .select(`
        id,
        name,
        sku,
        stock_qty,
        stock_pieces,
        allow_case,
        allow_piece,
        units_per_case,
        sell_price,
        price_case,
        sell_per_unit,
        sell_per_case,
        category_id,
        category_node_id,
        categories(name),
        category_nodes(name)
      `)
      .eq('distributor_id', distributorId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(1000)
  ])

  const products = (productsResult.data ?? []).map((product: any) => ({
    ...product,
    categories: Array.isArray(product.categories) ? product.categories[0] : product.categories,
    category_nodes: Array.isArray(product.category_nodes) ? product.category_nodes[0] : product.category_nodes
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/distributor/orders">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create Order</h1>
            <p className="text-sm text-slate-500">Create an order on behalf of a linked vendor.</p>
          </div>
        </div>
      </div>

      <DistributorCreateOrderClient
        vendors={vendors}
        products={products}
      />
    </div>
  )
}
