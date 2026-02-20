import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AppRole = 'distributor' | 'vendor'

export async function requireUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect('/login')
  return data.user
}

export async function requireProfile() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,role,display_name,active_distributor_id,distributor_code')
    .eq('id', user.id)
    .single()

  if (!profile?.role) redirect('/onboarding')
  return profile as {
    id: string
    email: string | null
    role: AppRole
    display_name: string | null
    active_distributor_id: string | null
    distributor_code: string | null
  }
}

export async function requireRole(role: AppRole) {
  const profile = await requireProfile()
  if (profile.role !== role) redirect('/')
  return profile
}
