'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Package,
    Layers,
    ShoppingCart,
    FileText,
    BadgeDollarSign,
    Store,
    LogOut
} from 'lucide-react'

interface SidebarProps {
    role: 'distributor' | 'vendor'
}

export function Sidebar({ role }: SidebarProps) {
    const pathname = usePathname()

    const distributorLinks = [
        { href: '/distributor', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/distributor/inventory', label: 'Inventory', icon: Package },
        { href: '/distributor/categories', label: 'Categories', icon: Layers },
        { href: '/distributor/orders', label: 'Orders', icon: ShoppingCart },
        { href: '/distributor/invoices', label: 'Invoices', icon: FileText },

        { href: '/distributor/analytics/profit', label: 'Profit Center', icon: BadgeDollarSign }, // Updated Path
    ]

    const vendorLinks = [
        { href: '/vendor', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/vendor/catalog', label: 'Catalog', icon: Store },
        { href: '/vendor/cart', label: 'Cart', icon: ShoppingCart },
        { href: '/vendor/orders', label: 'Orders', icon: Package },
        { href: '/vendor/invoices', label: 'Invoices', icon: FileText },
    ]

    const links = role === 'distributor' ? distributorLinks : vendorLinks

    return (
        <div className="flex h-full flex-col border-r border-slate-200 bg-white text-slate-900">
            <div className="flex h-14 items-center border-b border-slate-200 px-6 font-semibold">
                Portal
            </div>
            <div className="flex-1 overflow-auto py-4">
                <nav className="grid items-start px-4 text-sm font-medium">
                    {links.map((link) => {
                        const Icon = link.icon
                        return (
                            <Link
                                key={`${link.href}-${link.label}`}
                                href={link.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-slate-900",
                                    pathname === link.href
                                        ? "bg-slate-100 text-slate-900"
                                        : "text-slate-500 hover:bg-slate-50"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>
            <div className="border-t border-slate-200 p-4">
                <form action="/logout" method="post">
                    <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900">
                        <LogOut className="h-4 w-4" />
                        Logout
                    </button>
                </form>
            </div>
        </div>
    )
}
