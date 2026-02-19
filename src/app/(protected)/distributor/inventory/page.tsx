import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { InventoryClient } from './client'

export default async function InventoryPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('id,name').eq('distributor_id', distributorId).order('name', { ascending: true }),
    supabase
      .from('products')
      .select('id,name,sku,cost_price,sell_price,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,categories(name)')
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })
  ])

  // Transform products to match InventoryClient interface
  const formattedProducts = (products ?? []).map((p: any) => ({
    ...p,
    categories: Array.isArray(p.categories) ? p.categories[0] : p.categories
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      <InventoryClient
        initialProducts={formattedProducts}
        categories={categories || []}
      />
    </div>
  )
}
