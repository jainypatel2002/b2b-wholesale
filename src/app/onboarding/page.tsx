import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function saveOnboarding(formData: FormData) {
  'use server'
  const user = await requireUser()
  const role = String(formData.get('role') || '')
  const display_name = String(formData.get('display_name') || '').trim()
  const distributor_code = String(formData.get('distributor_code') || '').trim()

  if (role !== 'distributor' && role !== 'vendor') throw new Error('Invalid role')

  const supabase = await createClient()

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ role, display_name: display_name || null })
    .eq('id', user.id)

  if (upErr) throw upErr

  if (role === 'vendor') {
    if (!distributor_code) throw new Error('Distributor code is required for vendor onboarding.')

    const { error: linkErr } = await supabase
      .from('distributor_vendors')
      .insert({ distributor_id: distributor_code, vendor_id: user.id })

    if (linkErr) throw linkErr
  }

  redirect('/')
}

export default async function OnboardingPage() {
  await requireUser()

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Set up your account</h1>
        <p className="mt-2 text-sm text-slate-600">Choose your role. Vendors need the distributor code.</p>

        <form action={saveOnboarding} className="mt-6 space-y-4">
          <div>
            <label className="text-sm">Display name (optional)</label>
            <input name="display_name" className="input mt-1" placeholder="Ex: Jainy Wholesale" />
          </div>

          <div>
            <label className="text-sm">Role</label>
            <select name="role" className="input mt-1" defaultValue="distributor">
              <option value="distributor">Distributor</option>
              <option value="vendor">Vendor</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">If you pick Vendor, you must enter the distributor code below.</p>
          </div>

          <div>
            <label className="text-sm">Distributor code (vendors only)</label>
            <input name="distributor_code" className="input mt-1" placeholder="Distributor UUID" />
            <p className="mt-1 text-xs text-slate-500">The distributor can find this code on their dashboard.</p>
          </div>

          <button className="btn">Continue</button>
        </form>
      </div>
    </div>
  )
}
