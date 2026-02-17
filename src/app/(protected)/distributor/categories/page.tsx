import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Link className="link" href="/distributor">← Back</Link>
      </div>

      <div className="card p-6">
        <form action={addCategory} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-sm">New category name</label>
            <input className="input mt-1" name="name" placeholder="Ex: Tobacco" />
          </div>
          <button className="btn" type="submit">Add</button>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-medium">Your categories</h2>
        <div className="mt-3 space-y-2">
          {categories?.length ? (
            categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-600">No categories yet.</div>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-500">Distributor ID: {distributorId}</div>
    </div>
  )
}
