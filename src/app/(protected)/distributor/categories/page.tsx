import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CategoriesClient } from './client'

export default async function CategoriesPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  // Fetch top-level categories
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, created_at, is_active, deleted_at')
    .eq('distributor_id', distributorId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  // Fetch all active category nodes for this distributor
  const { data: nodesData } = await supabase
    .from('category_nodes')
    .select('id, category_id, parent_id, name, sort_order, created_at, is_active, deleted_at')
    .eq('distributor_id', distributorId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  // O(N) grouping by parent_id for efficient tree building
  const nodesByParent = new Map<string | null, any[]>()
  if (nodesData) {
    nodesData.forEach(node => {
      const parentKey = node.parent_id || null
      if (!nodesByParent.has(parentKey)) nodesByParent.set(parentKey, [])
      nodesByParent.get(parentKey)!.push(node)
    })
  }

  // Recursive tree builder inside JS memory
  const buildNodeTree = (parentId: string | null): any[] => {
    const children = nodesByParent.get(parentId) || []
    return children.map(child => ({
      ...child,
      children: buildNodeTree(child.id)
    }))
  }

  // Map the top-level categories to their root nodes
  const formattedCategories = (categories || []).map((c: any) => {
    const rootNodesForCategory = (nodesByParent.get(null) || []).filter(n => n.category_id === c.id)
    const structuredNodes = rootNodesForCategory.map(topNode => ({
      ...topNode,
      children: buildNodeTree(topNode.id)
    })).sort((a: any, b: any) => a.name.localeCompare(b.name))

    return {
      ...c,
      nodes: structuredNodes
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <Link href="/distributor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <CategoriesClient categories={formattedCategories} />
    </div>
  )
}
