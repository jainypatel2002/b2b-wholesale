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
        <div className="flex w-full rounded-md bg-slate-100 p-1">
            <div className="w-1/2 h-8" />
        </div>
    )

    return (
        <div className="flex w-full rounded-md bg-slate-100 p-1 mb-6">
            <button
                type="button"
                onClick={() => handleSelect('distributor')}
                className={cn(
                    'w-1/2 rounded-sm py-1.5 text-sm font-medium transition-all',
                    role === 'distributor'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                )}
            >
                Distributor
            </button>
            <button
                type="button"
                onClick={() => handleSelect('vendor')}
                className={cn(
                    'w-1/2 rounded-sm py-1.5 text-sm font-medium transition-all',
                    role === 'vendor'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                )}
            >
                Vendor
            </button>
        </div>
    )
}
