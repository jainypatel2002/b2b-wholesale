import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BusinessProfileForm } from '@/components/settings/business-profile-form'
import { getMyBusinessProfile } from '@/lib/business-profiles'

export default async function VendorSettingsPage() {
  await requireRole('vendor')
  const businessProfile = await getMyBusinessProfile()

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
