import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { InventoryClient } from './client'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  let schemaPending = false

  const [{ data: categories }, { data: categoryNodes }] = await Promise.all([
    supabase.from('categories').select('id,name').eq('distributor_id', distributorId).order('name', { ascending: true }),
    supabase.from('category_nodes').select('id,name,category_id').eq('distributor_id', distributorId).order('name', { ascending: true }),
  ])

  // Try richer selects first; progressively fall back if schema cache is stale.
  let products: any[] | null = null
  const selectCandidates = [
    'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,category_node_id,cost_mode,price_mode,stock_mode,stock_locked,locked_stock_qty,product_barcodes(id,barcode,is_primary,created_at),categories(name),category_nodes(name)',
    'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,category_node_id,cost_mode,price_mode,stock_mode,stock_locked,locked_stock_qty,categories(name),category_nodes(name)',
    'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,category_node_id,cost_mode,price_mode,stock_mode,product_barcodes(id,barcode,is_primary,created_at),categories(name),category_nodes(name)',
    'id,name,sku,barcode,cost_price,sell_price,cost_per_unit,sell_per_unit,cost_case,price_case,cost_per_case,sell_per_case,stock_qty,stock_pieces,allow_case,allow_piece,units_per_case,low_stock_threshold,created_at,category_id,category_node_id,cost_mode,price_mode,stock_mode,categories(name),category_nodes(name)'
  ]

  for (let i = 0; i < selectCandidates.length; i += 1) {
    const attempt = await supabase
      .from('products')
      .select(selectCandidates[i])
      .eq('distributor_id', distributorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (!attempt.error) {
      products = attempt.data
      if (i >= 2) schemaPending = true
      break
    }

    const msg = String(attempt.error.message || '')
    if (msg.includes('stock_locked') || msg.includes('locked_stock_qty')) {
      schemaPending = true
    }
  }

  // Transform products to match InventoryClient interface
  const formattedProducts = (products ?? []).map((p: any) => ({
    ...p,
    barcodes: (
      Array.isArray(p.product_barcodes) && p.product_barcodes.length > 0
        ? p.product_barcodes
        : (p.barcode ? [{ id: `legacy-${p.id}`, barcode: p.barcode, is_primary: true }] : [])
    )
      .map((entry: any) => ({
        id: String(entry.id || ''),
        barcode: String(entry.barcode || ''),
        is_primary: entry.is_primary !== false,
        created_at: entry.created_at ? String(entry.created_at) : undefined
      }))
      .filter((entry: any) => entry.id && entry.barcode)
      .sort((a: any, b: any) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return a.barcode.localeCompare(b.barcode)
      }),
    categories: Array.isArray(p.categories) ? p.categories[0] : p.categories,
    category_nodes: Array.isArray(p.category_nodes) ? p.category_nodes[0] : p.category_nodes
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventory</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      {schemaPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-800 flex items-center gap-2">
          <span className="font-medium">⚠ Database schema updating:</span>
          <span>The &quot;Lock Stock&quot; feature requires a migration. Please apply <code className="font-mono text-xs bg-amber-100 px-1 rounded">20260225150007_lock_stock_quantity.sql</code> in Supabase SQL Editor, then reload the schema cache (Settings → API → Reload).</span>
        </div>
      )}

      <InventoryClient
        initialProducts={formattedProducts}
        categories={categories || []}
        categoryNodes={categoryNodes || []}
        distributorId={distributorId}
      />
    </div>
  )
}
