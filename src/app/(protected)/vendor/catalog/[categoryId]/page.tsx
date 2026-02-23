import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { CategoryProductsClient } from './client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { notFound } from 'next/navigation'

export default async function CategoryProductsPage({ params }: { params: Promise<{ categoryId: string }> }) {
    const { categoryId } = await params
    const { distributorId } = await getVendorContext({ strict: false })
    const supabase = await createClient()

    if (!distributorId) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="rounded-full bg-slate-100 p-3 mb-4">
                    <AlertTriangle className="h-6 w-6 text-slate-500" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800">Not Linked to a Distributor</h2>
                <div className="mt-6">
                    <Link href="/onboarding">
                        <Button>Go to Onboarding</Button>
                    </Link>
                </div>
            </div>
        )
    }

    let products: any[] = []
    let categoryName = ''
    let subcategories: any[] = []
    let errorMsg = ''

    try {
        // 1. Validate Category & Fetch Name + Category Nodes Independently
        const [{ data: category, error: catError }, { data: categoryNodes, error: nodesError }] = await Promise.all([
            supabase
                .from('categories')
                .select('name')
                .eq('id', categoryId)
                .eq('distributor_id', distributorId)
                .eq('is_active', true)
                .is('deleted_at', null)
                .single(),
            supabase
                .from('category_nodes')
                .select('id, name')
                .eq('category_id', categoryId)
                .eq('distributor_id', distributorId)
                .eq('is_active', true)
                .is('deleted_at', null)
        ])

        if (catError || !category) {
            if (catError?.code === 'PGRST116') { // No rows found
                notFound()
            }
            throw catError || new Error('Category not found')
        }

        if (nodesError) throw nodesError

        categoryName = category.name
        subcategories = categoryNodes || []

        // Build a fast lookup map for node names
        const nodeMap = new Map()
        subcategories.forEach((n: any) => nodeMap.set(n.id, n.name))

        // 2. Fetch Products via the Pricing RPC Engine
        let productsData: any[] = []
        const { data: rpcData, error: prodError } = await supabase
            .rpc('get_vendor_catalog_prices', {
                p_distributor_id: distributorId
            })
            .eq('category_id', categoryId)

        if (prodError) {
            if (prodError.code === 'PGRST202') {
                console.warn('RPC get_vendor_catalog_prices not found, falling back to direct queries')

                // Get the current vendor's user ID for override scoping
                const { data: { user } } = await supabase.auth.getUser()
                const currentVendorId = user?.id

                const [{ data: fallbackData, error: fallbackError }, { data: overridesData }] = await Promise.all([
                    supabase
                        .from('products')
                        .select('id, name, sell_price, price_case, allow_case, allow_piece, units_per_case, category_id, category_node_id, stock_qty, stock_pieces, sku')
                        .eq('distributor_id', distributorId)
                        .eq('category_id', categoryId)
                        .is('deleted_at', null)
                        .order('name', { ascending: true }),
                    currentVendorId
                        ? supabase
                            .from('vendor_price_overrides')
                            .select('product_id, price_cents')
                            .eq('distributor_id', distributorId)
                            .eq('vendor_id', currentVendorId)
                        : Promise.resolve({ data: [], error: null })
                ])

                if (fallbackError) throw fallbackError

                const overrideMap = new Map((overridesData || []).map((o: any) => [o.product_id, o.price_cents]))

                productsData = (fallbackData ?? []).map((p: any) => {
                    const baseCents = Math.round((p.sell_price || 0) * 100)
                    const baseCaseCents = Math.round((p.price_case || 0) * 100)
                    const overrideCents = overrideMap.get(p.id)
                    return {
                        id: p.id,
                        name: p.name,
                        sku: p.sku,
                        effective_price_cents: overrideCents !== undefined ? overrideCents : baseCents,
                        base_price_cents: baseCents,
                        base_price_case_cents: baseCaseCents,
                        allow_case: p.allow_case,
                        allow_piece: p.allow_piece,
                        units_per_case: p.units_per_case,
                        category_id: p.category_id,
                        category_node_id: p.category_node_id,
                        stock_qty: p.stock_qty,
                        stock_pieces: p.stock_pieces
                    }
                })
            } else {
                throw prodError
            }
        } else {
            productsData = rpcData || []
        }

        // Map the RPC row schema to the client component's expectation smoothly
        products = (productsData ?? []).map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            sell_price: (p.base_price_cents ?? 0) / 100, // Normalized to dollars
            price_case: p.base_price_case_cents ? p.base_price_case_cents / 100 : null,
            vendor_price_override: p.effective_price_cents !== p.base_price_cents ? p.effective_price_cents / 100 : null,
            allow_case: p.allow_case,
            allow_piece: p.allow_piece,
            units_per_case: p.units_per_case,
            category_id: p.category_id,
            category_node_id: p.category_node_id,
            stock_qty: p.stock_qty,
            stock_pieces: p.stock_pieces,
            is_overridden: p.effective_price_cents !== p.base_price_cents,
            categories: { name: categoryName },
            subcategories: p.category_node_id ? { name: nodeMap.get(p.category_node_id) || 'Unknown' } : null
        }))

    } catch (err: any) {
        console.error('Error fetching category products:', err)
        errorMsg = err.message || 'Unknown error'
    }

    if (errorMsg) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/vendor/catalog">
                        <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">Error</h1>
                </div>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-red-700">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="font-medium">Error loading products</span>
                        </div>
                        <p className="mt-1 text-sm text-red-600 ml-6">{errorMsg}</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <CategoryProductsClient
            products={products}
            categoryName={categoryName}
            subcategories={subcategories}
            distributorId={distributorId}
        />
    )
}
