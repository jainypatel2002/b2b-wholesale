import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'

export default async function Home() {
  const profile = await requireProfile()
  if (profile.role === 'distributor') redirect('/distributor')
  if (profile.role === 'vendor') redirect('/vendor')
  redirect('/onboarding')
}
