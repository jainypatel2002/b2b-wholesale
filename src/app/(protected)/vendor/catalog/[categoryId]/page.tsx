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
        // 1. Validate Category & Fetch Name + Subcategories
        const { data: category, error: catError } = await supabase
            .from('categories')
            .select('name, subcategories(id, name)')
            .eq('id', categoryId)
            .eq('distributor_id', distributorId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .single()

        if (catError || !category) {
            if (catError?.code === 'PGRST116') { // No rows found
                notFound()
            }
            throw catError || new Error('Category not found')
        }

        categoryName = category.name
        subcategories = category.subcategories || []

        // 2. Fetch Products
        const { data: productsData, error: prodError } = await supabase
            .from('products')
            .select('id,name,sell_price,allow_case,allow_piece,units_per_case,subcategory_id,category_id,categories(name),subcategories(name),stock_qty,stock_pieces,sku')
            .eq('distributor_id', distributorId)
            .eq('category_id', categoryId)
            .eq('active', true)
            .is('deleted_at', null)
            .order('name', { ascending: true })

        if (prodError) throw prodError
        products = productsData ?? []

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
        />
    )
}
