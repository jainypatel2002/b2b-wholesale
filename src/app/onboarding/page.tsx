import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './OnboardingForm'

async function saveOnboarding(formData: FormData) {
  'use server'
  const user = await requireUser()
  const role = String(formData.get('role') || '')
  const display_name = String(formData.get('display_name') || '').trim()
  const distributor_id = String(formData.get('distributor_id') || '').trim() // NOW UUID

  if (role !== 'distributor' && role !== 'vendor') throw new Error('Invalid role')

  const supabase = await createClient()

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ role, display_name: display_name || null })
    .eq('id', user.id)

  if (upErr) throw new Error('Failed to update profile')

  if (role === 'vendor') {
    if (!distributor_id) throw new Error('Distributor ID is required for vendor onboarding.')

    // Validate if link already exists
    const { data: existingLink } = await supabase
      .from('distributor_vendors')
      .select('id')
      .eq('vendor_id', user.id)
      .eq('distributor_id', distributor_id)
      .single()

    if (!existingLink) {
      const { error: linkErr } = await supabase
        .from('distributor_vendors')
        .insert({ distributor_id, vendor_id: user.id })

      if (linkErr) throw new Error('Failed to link checking distributor code')
    }

    // Set active distributor
    await supabase.from('profiles').update({ active_distributor_id: distributor_id }).eq('id', user.id)
  }

  redirect('/')
}

export default async function OnboardingPage() {
  await requireUser()

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="card p-6 shadow-sm border border-slate-200 rounded-lg">
        <h1 className="text-2xl font-bold tracking-tight">Set up your account</h1>
        <p className="mt-2 text-sm text-slate-600">Choose your role. Vendors need to connect to a distributor to see their catalog.</p>

        <OnboardingForm submitAction={saveOnboarding} />
      </div>
    </div>
  )
}
