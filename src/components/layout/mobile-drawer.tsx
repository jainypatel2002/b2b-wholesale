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
    links: { href: string; label: string; icon: any }[]
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
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
                <Menu className="h-6 w-6 text-slate-700" />
                <span className="sr-only">Toggle menu</span>
            </Button>

            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Drawer */}
            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-white shadow-xl transition-transform duration-300 ease-in-out transform",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 h-14 border-b border-slate-200">
                        <span className="font-semibold text-lg">Menu</span>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                            <X className="h-5 w-5 text-slate-500" />
                        </Button>
                    </div>

                    {/* Links */}
                    <div className="flex-1 overflow-y-auto py-4">


                        // ...

                        <nav className="flex flex-col gap-1 px-3">
                            {links.map((link) => {
                                const Icon = iconMap[link.icon] || iconMap['LayoutDashboard']
                                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')

                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                            isActive
                                                ? "bg-slate-100 text-slate-900"
                                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        {link.label}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>

                    {/* Footer / Logout */}
                    <div className="border-t border-slate-200 p-4">
                        <form action="/logout" method="post">
                            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-all hover:bg-slate-50 hover:text-red-600">
                                <LogOut className="h-5 w-5" />
                                Logout
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
