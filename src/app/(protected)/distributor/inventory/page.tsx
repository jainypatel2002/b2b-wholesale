import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { InventoryClient } from './client'

async function addProduct(formData: FormData) {
  'use server'
  const { distributorId } = await getDistributorContext()
  const name = String(formData.get('name') || '').trim()
  const sku = String(formData.get('sku') || '').trim() || null
  const category_id = String(formData.get('category_id') || '').trim() || null
  const cost_price = Number(formData.get('cost_price') || 0)
  const sell_price = Number(formData.get('sell_price') || 0)
  const stock_qty = Number(formData.get('stock_qty') || 0)

  if (!name) throw new Error('Product name required')
  if (Number.isNaN(cost_price) || Number.isNaN(sell_price) || Number.isNaN(stock_qty)) throw new Error('Invalid number')

  const supabase = await createClient()
  const { error } = await supabase.from('products').insert({
    distributor_id: distributorId,
    category_id,
    name,
    sku,
    cost_price,
    sell_price,
    stock_qty
  })
  if (error) throw error
}



export default async function InventoryPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('id,name').eq('distributor_id', distributorId).order('name', { ascending: true }),
    supabase
      .from('products')
      .select('id,name,sku,cost_price,sell_price,stock_qty,created_at,category_id,categories(name)')
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
        addProductAction={addProduct}
      />
    </div>
  )
}
