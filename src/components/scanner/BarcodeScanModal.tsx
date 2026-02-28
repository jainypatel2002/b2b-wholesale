'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { acquireBodyScrollLock } from '@/lib/ui/scroll-lock'

interface BarcodeScanModalProps {
    open: boolean
    onClose: () => void
    title: string
    description?: string
    maxWidthClassName?: string
    children: ReactNode
}

export function BarcodeScanModal({
    open,
    onClose,
    title,
    description,
    maxWidthClassName = 'max-w-lg',
    children
}: BarcodeScanModalProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted || !open) return
        return acquireBodyScrollLock()
    }, [mounted, open])

    useEffect(() => {
        if (!open) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }

        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [open, onClose])

    if (!mounted || !open) return null

    return createPortal(
        <div
            className="fixed inset-0 z-[120] bg-black/55 p-3 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div className="mx-auto flex h-full w-full items-start justify-center overflow-y-auto pt-2 sm:pt-6">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    className={`w-full ${maxWidthClassName} rounded-2xl border border-white/70 bg-white shadow-2xl`}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                            {description && <p className="text-xs text-slate-500">{description}</p>}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close scanner modal">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto p-4">{children}</div>
                </div>
            </div>
        </div>,
        document.body
    )
}
