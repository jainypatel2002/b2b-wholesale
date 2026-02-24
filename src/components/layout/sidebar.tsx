'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogOut } from 'lucide-react'

import { iconMap } from '@/config/icons'

import { distributorLinks, vendorLinks } from '@/config/nav'

interface SidebarProps {
    role: 'distributor' | 'vendor'
}

export function Sidebar({ role }: SidebarProps) {
    const pathname = usePathname()
    const links = role === 'distributor' ? distributorLinks : vendorLinks

    return (
        <div className="flex h-full flex-col bg-transparent text-slate-900">
            <div className="px-6 pb-4 pt-6">
                <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.6)] backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Distributor Vendor</p>
                    <p className="text-lg font-semibold text-slate-900">Portal</p>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">{role} workspace</p>
                </div>
            </div>
            <div className="flex-1 overflow-auto px-4 pb-4">
                <nav className="grid gap-1.5 text-sm font-medium">
                    {links.map((link) => {
                        const Icon = iconMap[link.icon] || iconMap['LayoutDashboard']
                        const isExact = (link as any).exact
                        const isActive = isExact
                            ? pathname === link.href
                            : pathname === link.href || pathname.startsWith(`${link.href}/`)

                        return (
                            <Link
                                key={`${link.href}-${link.label}`}
                                href={link.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-200",
                                    isActive
                                        ? "brand-gradient text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.9)]"
                                        : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                                )}
                            >
                                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-700")} />
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>
            <div className="mt-auto border-t border-white/70 p-4">
                <form action="/logout" method="post">
                    <button className="focus-ring-brand flex w-full items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                        <LogOut className="h-4 w-4" />
                        Logout
                    </button>
                </form>
            </div>
        </div>
    )
}
