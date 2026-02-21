import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { InventoryClient } from './client'

export default async function InventoryPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  let schemaPending = false

  const [{ data: categories }, { data: categoryNodes }] = await Promise.all([
    supabase.from('categories').select('id,name').eq('distributor_id', distributorId).order('name', { ascending: true }),
    supabase.from('category_nodes').select('id,name,category_id').eq('distributor_id', distributorId).order('name', { ascending: true }),
  ])

  // Try full query including lock columns; fall back if schema is stale
  let products: any[] | null = null
  const fullSelect = 'id,name,sku,cost_price,sell_price,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,category_node_id,cost_case,price_case,cost_mode,price_mode,stock_mode,stock_locked,locked_stock_qty,categories(name),category_nodes(name)'
  const fallbackSelect = 'id,name,sku,cost_price,sell_price,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,category_node_id,cost_case,price_case,cost_mode,price_mode,stock_mode,categories(name),category_nodes(name)'

  const { data, error } = await supabase
    .from('products')
    .select(fullSelect)
    .eq('distributor_id', distributorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error && (error.message?.includes('schema cache') || error.message?.includes('Could not find'))) {
    schemaPending = true
    const fallback = await supabase
      .from('products')
      .select(fallbackSelect)
      .eq('distributor_id', distributorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    products = fallback.data
  } else {
    products = data
  }

  // Transform products to match InventoryClient interface
  const formattedProducts = (products ?? []).map((p: any) => ({
    ...p,
    categories: Array.isArray(p.categories) ? p.categories[0] : p.categories,
    category_nodes: Array.isArray(p.category_nodes) ? p.category_nodes[0] : p.category_nodes
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      {schemaPending && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm flex items-center gap-2">
          <span className="font-medium">⚠ Database schema updating:</span>
          <span>The &quot;Lock Stock&quot; feature requires a migration. Please apply <code className="font-mono text-xs bg-amber-100 px-1 rounded">20260225150007_lock_stock_quantity.sql</code> in Supabase SQL Editor, then reload the schema cache (Settings → API → Reload).</span>
        </div>
      )}

      <InventoryClient
        initialProducts={formattedProducts}
        categories={categories || []}
        categoryNodes={categoryNodes || []}
      />
    </div>
  )
}
