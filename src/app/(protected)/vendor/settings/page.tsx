import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BusinessProfileForm } from '@/components/settings/business-profile-form'
import { getMyBusinessProfile } from '@/lib/business-profiles'
import { SavedDistributorsCard } from '@/components/vendor/saved-distributors-card'
import type { SavedDistributorSettingsItem } from '@/app/(protected)/vendor/actions'

function normalizeCode(input: string) {
  return input.replace(/\s+/g, '').toUpperCase()
}

export default async function VendorSettingsPage() {
  const profile = await requireRole('vendor')
  const businessProfile = await getMyBusinessProfile()

  const supabase = await createClient()

  let featureAvailable = true
  let savedRows: Array<{
    id: string
    distributor_name: string
    distributor_code: string
    created_at: string
    updated_at: string
    last_used_at: string | null
  }> = []

  const { data: savedData, error: savedError } = await supabase
    .from('vendor_saved_distributor_codes')
    .select('id, distributor_name, distributor_code, created_at, updated_at, last_used_at')
    .eq('vendor_id', profile.id)
    .order('created_at', { ascending: false })

  if (savedError) {
    if (savedError.code === '42P01') {
      featureAvailable = false
    } else {
      console.error('Failed to load saved distributor codes', savedError)
    }
  } else {
    savedRows = savedData || []
  }

  const { data: linkedRows, error: linkedError } = await supabase
    .from('distributor_vendors')
    .select('distributor_id, distributor:profiles!distributor_id(id, display_name, email, distributor_code)')
    .eq('vendor_id', profile.id)

  if (linkedError) {
    console.error('Failed to load linked distributors for saved code status', linkedError)
  }

  const linkedByCode = new Map<string, { id: string; name: string }>()
  for (const row of linkedRows || []) {
    const distributor = (row as any).distributor
    const distributorCode = normalizeCode(String(distributor?.distributor_code || ''))
    if (!distributorCode) continue

    linkedByCode.set(distributorCode, {
      id: String(distributor?.id || (row as any).distributor_id),
      name: distributor?.display_name || distributor?.email || 'Distributor'
    })
  }

  const initialSavedDistributors: SavedDistributorSettingsItem[] = savedRows.map((row) => {
    const code = normalizeCode(row.distributor_code)
    const linked = linkedByCode.get(code)

    return {
      id: row.id,
      distributorName: row.distributor_name,
      distributorCode: code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      linked: Boolean(linked),
      linkedDistributorId: linked?.id || null,
      linkedDistributorName: linked?.name || null
    }
  })

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 md:px-0">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Account Settings</h1>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Business Profile</CardTitle>
            <CardDescription>
              This information appears in invoice headers for your billing details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessProfileForm initialProfile={businessProfile} />
          </CardContent>
        </Card>

        <SavedDistributorsCard
          initialItems={initialSavedDistributors}
          activeDistributorId={profile.active_distributor_id}
          featureAvailable={featureAvailable}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Distributor Connection</CardTitle>
            <CardDescription>
              Connect to another distributor or switch your active relationship.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/vendor/settings/connect">
              <Button variant="outline" className="w-full sm:w-auto">Manage Distributor Connections</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
