import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CategoriesClient } from './client'

export default async function CategoriesPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  // Fetch categories with subcategories
  const { data: categories } = await supabase
    .from('categories')
    .select(`
        id,
        name,
        created_at,
        deleted_at,
        is_active,
        subcategories (
            id,
            name,
            created_at,
            deleted_at,
            is_active
        )
    `)
    .eq('distributor_id', distributorId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  // Clean up subcategories order and filter out deleted ones
  const formattedCategories = (categories || []).map((c: any) => ({
    ...c,
    subcategories: (c.subcategories || [])
      .filter((s: any) => !s.deleted_at && s.is_active !== false)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  }))

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
