import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { VendorPricingClient } from './client'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function VendorPricingPage() {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // 1. Fetch Linked Vendors (canonical function from data.ts)
    const vendors = await getLinkedVendors(distributorId)

    // 2. Fetch All Products and Categories explicitly to avoid schema cache FK errors
    const [
        { data: productsData, error: prodErr },
        { data: categoriesData },
        { data: categoryNodesData }
    ] = await Promise.all([
        supabase
            .from('products')
            .select(`
                id, 
                name, 
                sku, 
                sell_per_unit,
                sell_per_case,
                sell_price, 
                price_case,
                allow_case,
                allow_piece,
                units_per_case,
                stock_pieces,
                category_id, 
                category_node_id
            `)
            .eq('distributor_id', distributorId)
            .is('deleted_at', null)
            .order('name', { ascending: true }),
        supabase.from('categories').select('id, name').eq('distributor_id', distributorId),
        supabase.from('category_nodes').select('id, name').eq('distributor_id', distributorId)
    ])

    if (prodErr) throw prodErr

    const catMap = new Map((categoriesData || []).map((c: any) => [c.id, c.name]))
    const nodeMap = new Map((categoryNodesData || []).map((n: any) => [n.id, n.name]))

    const products = (productsData || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        base_unit_price: p.sell_per_unit ?? p.sell_price, // Canonical first, legacy fallback
        base_case_price: p.sell_per_case ?? p.price_case,
        allow_case: p.allow_case !== false,
        allow_piece: p.allow_piece !== false,
        units_per_case: p.units_per_case,
        stock_pieces: p.stock_pieces,
        category_id: p.category_id,
        category_node_id: p.category_node_id,
        category: catMap.get(p.category_id),
        node: nodeMap.get(p.category_node_id)
    }))

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Vendor Pricing Engine</h1>
                    <p className="text-sm text-slate-500">Configure client-specific overrides and bulk price adjustments.</p>
                </div>
                <Link href="/distributor">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                    </Button>
                </Link>
            </div>

            <VendorPricingClient vendors={vendors} products={products} />
        </div>
    )
}
