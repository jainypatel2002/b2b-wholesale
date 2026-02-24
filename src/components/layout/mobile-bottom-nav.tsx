'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

import { distributorLinks, vendorLinks } from '@/config/nav'
import { iconMap } from '@/config/icons'

interface MobileBottomNavProps {
    role: 'distributor' | 'vendor'
}

export function MobileBottomNav({ role }: MobileBottomNavProps) {
    const pathname = usePathname()

    // Filter links for bottom nav if needed, or use a subset
    // For now, we use the first 4-5 items or specific ones logic
    // But simplicity suggests using the same list, maybe slicing it if too long
    // Distributor has 6 items, Bottom nav fits 5 max comfortably. 
    // Let's use the first 5 for now or keep existing logic.
    // Existing logic had 5 items for distributor.
    // Config has 6. 'Categories' was missing in bottom nav. 
    // Drawer handles full list. Bottom nav can be quick access.

    const visibleDistributorLinks = distributorLinks.filter(l => l.label !== 'Categories')
    // Root cause: vendor Settings was intentionally filtered out from mobile quick nav.
    // Keep full vendor parity with desktop/drawer by rendering all vendor links here.
    const visibleVendorLinks = vendorLinks
    const links = role === 'distributor' ? visibleDistributorLinks : visibleVendorLinks

    if (pathname.includes('/print')) return null

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 block border-t border-white/70 bg-white/85 pb-safe shadow-[0_-8px_30px_-24px_rgba(15,23,42,0.7)] backdrop-blur-xl md:hidden print:hidden">
            <div className="mx-2 my-2 flex h-16 items-center justify-around gap-1 rounded-2xl border border-white/70 bg-white/70 px-1">
                {links.map((link) => {
                    // @ts-ignore - exact property is optional but TS might not infer it correctly from the config array union
                    const isExact = (link as any).exact
                    const isActive = isExact
                        ? pathname === link.href
                        : pathname.startsWith(link.href)

                    const Icon = iconMap[link.icon] || iconMap['LayoutDashboard']

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition-all",
                                isActive
                                    ? "bg-sky-50 text-primary shadow-[0_8px_20px_-16px_rgba(15,23,42,0.8)]"
                                    : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="truncate">{link.label}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
