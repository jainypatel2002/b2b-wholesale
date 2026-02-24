'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface RoleSelectorProps {
    onSelect: (role: string) => void
    initialRole?: string
}

export function RoleSelector({ onSelect, initialRole = 'vendor' }: RoleSelectorProps) {
    const [role, setRole] = useState(initialRole)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        // Load from localStorage on mount
        const saved = localStorage.getItem('auth_selected_role')
        if (saved && (saved === 'distributor' || saved === 'vendor')) {
            setRole(saved)
            onSelect(saved)
        } else {
            // Default to vendor if nothing saved
            onSelect(initialRole)
        }
        setMounted(true)
    }, [initialRole, onSelect])

    const handleSelect = (r: string) => {
        setRole(r)
        localStorage.setItem('auth_selected_role', r)
        onSelect(r)
    }

    // Prevent hydration mismatch
    if (!mounted) return (
        <div className="mb-6 flex w-full rounded-xl border border-white/12 bg-white/[0.06] p-1">
            <div className="w-1/2 h-8" />
        </div>
    )

    return (
        <div className="mb-6 flex w-full rounded-xl border border-white/12 bg-white/[0.06] p-1">
            <button
                type="button"
                onClick={() => handleSelect('distributor')}
                className={cn(
                    'w-1/2 rounded-lg py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0',
                    role === 'distributor'
                        ? 'border border-white/20 bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                        : 'text-white/72 hover:text-white'
                )}
            >
                Distributor
            </button>
            <button
                type="button"
                onClick={() => handleSelect('vendor')}
                className={cn(
                    'w-1/2 rounded-lg py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0',
                    role === 'vendor'
                        ? 'border border-white/20 bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                        : 'text-white/72 hover:text-white'
                )}
            >
                Vendor
            </button>
        </div>
    )
}
