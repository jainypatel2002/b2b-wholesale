import { Button } from "@/components/ui/button"
import { MobileDrawer } from "@/components/layout/mobile-drawer"
import { distributorLinks, vendorLinks } from "@/config/nav"

interface HeaderProps {
    email: string
    role: string
}

export function Header({ email, role }: HeaderProps) {
    // Determine links based on role
    const links = role === 'distributor' ? distributorLinks : vendorLinks
    // Cast role to specific type for prop
    const safeRole = (role === 'distributor' || role === 'vendor') ? role : 'distributor'

    return (
        <header className="flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 md:px-6 sticky top-0 z-50">
            {/* Hamburger - Mobile Only */}
            <div className="md:hidden">
                <MobileDrawer role={safeRole} links={links} />
            </div>

            <div className="ml-auto flex items-center gap-4">
                <div className="text-right hidden sm:block">
                    <div className="text-sm font-medium text-slate-900">{email}</div>
                    <div className="text-xs text-slate-500 capitalize">{role}</div>
                </div>
                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                    {email[0].toUpperCase()}
                </div>
            </div>
        </header>
    )
}
