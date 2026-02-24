'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X, Menu, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { iconMap } from '@/config/icons'

interface MobileDrawerProps {
    role: 'distributor' | 'vendor'
    links: { href: string; label: string; icon: any; exact?: boolean }[]
}

export function MobileDrawer({ role, links }: MobileDrawerProps) {
    const [isOpen, setIsOpen] = React.useState(false)
    const pathname = usePathname()

    // Close drawer on route change
    useEffect(() => {
        setIsOpen(false)
    }, [pathname])

    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'unset'
        }
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [isOpen])

    return (
        <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="h-10 w-10 rounded-xl">
                <Menu className="h-5 w-5 text-slate-700" />
                <span className="sr-only">Toggle menu</span>
            </Button>

            {isOpen && (
                <div
                    className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-[82%] max-w-xs border-r border-white/70 bg-white/85 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-in-out",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex h-full flex-col">
                    <div className="flex h-16 items-center justify-between border-b border-white/70 px-5">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{role}</p>
                            <span className="text-base font-semibold text-slate-900">Navigation</span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                            <X className="h-5 w-5 text-slate-500" />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-4">
                        <nav className="flex flex-col gap-1.5">
                            {links.map((link) => {
                                const Icon = iconMap[link.icon] || iconMap['LayoutDashboard']
                                const isActive = link.exact
                                    ? pathname === link.href
                                    : pathname === link.href || pathname.startsWith(link.href + '/')

                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                                            isActive
                                                ? "brand-gradient text-white shadow-[0_10px_20px_-14px_rgba(15,23,42,0.9)]"
                                                : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                                        )}
                                    >
                                        <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-slate-500")} />
                                        {link.label}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>

                    <div className="border-t border-white/70 p-4">
                        <form action="/logout" method="post">
                            <button className="focus-ring-brand flex w-full items-center gap-3 rounded-xl border border-white/70 bg-white/75 px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                                <LogOut className="h-4 w-4" />
                                Logout
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
