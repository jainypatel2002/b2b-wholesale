import { MobileDrawer } from "@/components/layout/mobile-drawer"
import { distributorLinks, vendorLinks } from "@/config/nav"
import { DistributorSwitcher } from "@/components/layout/distributor-switcher"
import { createClient } from "@/lib/supabase/server"
import { requireProfile } from "@/lib/auth"
import { NotificationsBell } from "@/components/notifications-bell"

interface HeaderProps {
    email: string
    role: string
}

export async function Header({ email, role }: HeaderProps) {
    // Determine links based on role
    const links = role === 'distributor' ? distributorLinks : vendorLinks
    // Cast role to specific type for prop
    const safeRole = (role === 'distributor' || role === 'vendor') ? role : 'distributor'

    let linkedDistributors: any[] = []
    let currentDistributorId = null

    const profile = await requireProfile()

    if (role === 'vendor') {
        currentDistributorId = profile.active_distributor_id

        const supabase = await createClient()
        const { data } = await supabase
            .from('distributor_vendors')
            .select('distributor_id, distributor:profiles!distributor_id(id, display_name, email)')
            .eq('vendor_id', profile.id)

        linkedDistributors = (data || []).map((d: any) => ({
            id: d.distributor.id,
            name: d.distributor.display_name || d.distributor.email || 'Unknown Distributor'
        }))
    }

    return (
        <div className="flex min-h-14 items-center gap-3 px-4 py-2 md:px-5">
            <div className="md:hidden">
                <MobileDrawer role={safeRole} links={links} />
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
                {role === 'vendor' && (
                    <DistributorSwitcher
                        currentDistributorId={currentDistributorId}
                        linkedDistributors={linkedDistributors}
                    />
                )}

                <NotificationsBell userId={profile.id} />

                <div className="hidden text-right sm:block">
                    <div className="text-sm font-medium text-slate-900">{email}</div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{role}</div>
                </div>
                <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm">
                    {(email?.[0] || '?').toUpperCase()}
                </div>
            </div>
        </div>
    )
}
