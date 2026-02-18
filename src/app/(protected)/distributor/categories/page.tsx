import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Plus, Folder } from 'lucide-react'

async function addCategory(formData: FormData) {
  'use server'
  const { distributorId } = await getDistributorContext()
  const name = String(formData.get('name') || '').trim()
  if (!name) throw new Error('Category name required')

  const supabase = await createClient()
  const { error } = await supabase.from('categories').insert({ distributor_id: distributorId, name })
  if (error) throw error
}

export default async function CategoriesPage() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('id,name,created_at')
    .eq('distributor_id', distributorId)
    .order('name', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <Link href="/distributor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Add Category Form */}
        <Card>
          <CardHeader>
            <CardTitle>Add New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addCategory} className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Category Name</label>
                <Input name="name" placeholder="Ex: Tobacco, Beverages..." required />
              </div>
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Categories List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categories?.length ? (
                categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Folder className="h-4 w-4 text-slate-400" />
                      <span className="font-medium">{c.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 italic py-4 text-center">No categories yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
