import { requireRole } from '@/lib/auth'
import { ShareCodeCard } from '@/components/distributor/share-code-card'
import { DisplayNameForm } from '@/components/distributor/display-name-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CopyButton } from '@/components/ui/copy-button'

export default async function DistributorSettingsPage() {
    const profile = await requireRole('distributor')

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Account Settings</h1>

            <div className="grid gap-6 max-w-3xl">
                {/* Profile Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Profile Details</CardTitle>
                        <CardDescription>Update how your business appears to vendors.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DisplayNameForm initialName={profile.display_name || ''} />
                    </CardContent>
                </Card>

                {/* Connection Codes */}
                <div className="grid gap-6 md:grid-cols-2">
                    <ShareCodeCard initialCode={profile.distributor_code} className="h-full" />

                    <Card className="h-full">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-medium text-slate-500">Distributor UUID</CardTitle>
                            <CardDescription>Internal identifier (used for legacy linking or dev purposes).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1">
                                        <div className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 py-3 px-4 font-mono text-sm tracking-wider text-slate-900 shadow-sm overflow-hidden text-ellipsis whitespace-nowrap">
                                            <span>{profile.id}</span>
                                        </div>
                                    </div>
                                </div>
                                <CopyButton text={profile.id} label="Copy UUID" className="w-full" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
