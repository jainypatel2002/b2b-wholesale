'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MobileDashboardButtonProps {
    role: 'distributor' | 'vendor'
}

export function MobileDashboardButton({ role }: MobileDashboardButtonProps) {
    const pathname = usePathname()

    // Don't show on dashboard itself, login, onboarding, or print pages
    const isDashboard = pathname === `/${role}`
    const shouldHide =
        isDashboard ||
        pathname.includes('/login') ||
        pathname.includes('/onboarding') ||
        pathname.includes('/print')

    if (shouldHide) return null

    return (
        <div className="fixed bottom-20 right-4 z-40 md:hidden print:hidden">
            <Link href={`/${role}`}>
                <Button
                    size="icon"
                    className="h-12 w-12 rounded-full shadow-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                    <LayoutDashboard className="h-5 w-5" />
                    <span className="sr-only">Back to Dashboard</span>
                </Button>
            </Link>
        </div>
    )
}
