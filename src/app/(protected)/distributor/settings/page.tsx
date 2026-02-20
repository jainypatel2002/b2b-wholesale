import { requireRole } from '@/lib/auth'
import { ShareCodeCard } from '@/components/distributor/share-code-card'

export default async function DistributorSettingsPage() {
    const profile = await requireRole('distributor')

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

            <div className="grid gap-6 max-w-2xl">
                <ShareCodeCard initialCode={profile.distributor_code} />
            </div>
        </div>
    )
}
