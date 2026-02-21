import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { BulkPricingClient } from './client'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function BulkPricingPage() {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // 1. Fetch categories + nodes tree
    const [{ data: categories }, { data: nodesData }] = await Promise.all([
        supabase
            .from('categories')
            .select('id, name')
            .eq('distributor_id', distributorId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('name', { ascending: true }),
        supabase
            .from('category_nodes')
            .select('id, category_id, parent_id, name')
            .eq('distributor_id', distributorId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('name', { ascending: true })
    ])

    // Build tree structure for client
    const nodesByParent = new Map<string | null, any[]>()
    if (nodesData) {
        nodesData.forEach(node => {
            const parentKey = node.parent_id || null
            if (!nodesByParent.has(parentKey)) nodesByParent.set(parentKey, [])
            nodesByParent.get(parentKey)!.push(node)
        })
    }

    const buildNodeTree = (parentId: string | null): any[] => {
        const children = nodesByParent.get(parentId) || []
        return children.map(child => ({
            id: child.id,
            name: child.name,
            category_id: child.category_id,
            children: buildNodeTree(child.id)
        }))
    }

    const categoryTree = (categories || []).map((c: any) => {
        const rootNodes = (nodesByParent.get(null) || []).filter(n => n.category_id === c.id)
        return {
            id: c.id,
            name: c.name,
            nodes: rootNodes.map(topNode => ({
                id: topNode.id,
                name: topNode.name,
                category_id: topNode.category_id,
                children: buildNodeTree(topNode.id)
            }))
        }
    })

    // 2. Fetch linked vendors
    const vendors = await getLinkedVendors(distributorId)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Bulk Price Adjustment</h1>
                    <p className="text-sm text-slate-500">Adjust prices across categories and vendors in bulk.</p>
                </div>
                <Link href="/distributor">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                    </Button>
                </Link>
            </div>

            <BulkPricingClient categoryTree={categoryTree} vendors={vendors} />
        </div>
    )
}
