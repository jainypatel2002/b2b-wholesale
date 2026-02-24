'use client'

import React, { useRef, useEffect, useCallback, useState } from 'react'

export type ScanStatus = 'idle' | 'ready' | 'searching' | 'found' | 'not_found' | 'error' | 'camera_active'

interface BarcodeScannerPanelProps {
    scanMode: boolean
    onToggleScanMode: () => void
    status: ScanStatus
    statusMessage?: string
    onOpenCamera: () => void
    autoFallback: boolean
    onToggleAutoFallback: () => void
}

const SCAN_CATCHER_ID = 'barcode-scan-catcher'

export function BarcodeScannerPanel({
    scanMode,
    onToggleScanMode,
    status,
    statusMessage,
    onOpenCamera,
    autoFallback,
    onToggleAutoFallback,
}: BarcodeScannerPanelProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [focusLost, setFocusLost] = useState(false)

    const focusCatcher = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus()
            setFocusLost(false)
        }
    }, [])

    // Auto-focus when scan mode turns ON
    useEffect(() => {
        if (scanMode) {
            const t = setTimeout(focusCatcher, 100)
            return () => clearTimeout(t)
        } else {
            setFocusLost(false)
        }
    }, [scanMode, focusCatcher])

    // Monitor focus loss on scan catcher
    useEffect(() => {
        if (!scanMode) return

        const handleFocusOut = () => {
            setTimeout(() => {
                if (
                    scanMode &&
                    inputRef.current &&
                    document.activeElement !== inputRef.current
                ) {
                    setFocusLost(true)
                }
            }, 100)
        }

        const el = inputRef.current
        el?.addEventListener('blur', handleFocusOut)
        return () => el?.removeEventListener('blur', handleFocusOut)
    }, [scanMode])

    const statusConfig: Record<ScanStatus, { color: string; bg: string; border: string; icon: string; defaultMsg: string }> = {
        idle: { color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', icon: '📷', defaultMsg: 'Scanner off' },
        ready: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: '✅', defaultMsg: 'Ready to scan' },
        searching: { color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', icon: '🔍', defaultMsg: 'Searching…' },
        found: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: '✅', defaultMsg: 'Product found!' },
        not_found: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: '➕', defaultMsg: 'New barcode — add product' },
        error: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: '⚠️', defaultMsg: 'Lookup failed. Try again.' },
        camera_active: { color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: '📸', defaultMsg: 'Camera active' },
    }

    const cfg = statusConfig[status]

    return (
        <div className="flex flex-col gap-2">
            {/* Controls Row */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Scanner toggle */}
                <button
                    type="button"
                    onClick={onToggleScanMode}
                    className={`
                        inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold
                        border transition-all duration-200 select-none
                        ${scanMode
                            ? 'brand-gradient border-transparent text-white shadow-sm hover:opacity-95'
                            : 'border-[hsl(var(--surface-border))] bg-white/80 text-slate-700 hover:bg-white'
                        }
                    `}
                >
                    <span className="text-base">{scanMode ? '📡' : '📷'}</span>
                    {scanMode ? 'Scanner ON' : 'Scan Mode'}
                </button>

                {/* Camera Scanner button */}
                <button
                    type="button"
                    onClick={onOpenCamera}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold
                        border border-[hsl(var(--surface-border))] bg-white/80 text-slate-700 hover:bg-white
                        transition-all duration-200 select-none"
                >
                    <span className="text-base">📸</span>
                    Use Camera
                </button>

                {/* Status badge */}
                {(scanMode || status === 'camera_active') && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <span>{cfg.icon}</span>
                        {statusMessage || cfg.defaultMsg}
                    </span>
                )}
            </div>

            {/* Auto-fallback toggle (only visible when scan mode is ON) */}
            {scanMode && (
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none pl-1">
                    <input
                        type="checkbox"
                        checked={autoFallback}
                        onChange={onToggleAutoFallback}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary shadow-sm focus:ring-primary/40"
                    />
                    Auto-open camera if no scan in 5 seconds
                </label>
            )}

            {/* Hidden scan catcher input */}
            {scanMode && (
                <input
                    ref={inputRef}
                    id={SCAN_CATCHER_ID}
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-label="Barcode scan input"
                    className="sr-only"
                    tabIndex={-1}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                        }
                    }}
                />
            )}

            {/* Focus-lost banner (important for iPhone Safari) */}
            {scanMode && focusLost && (
                <button
                    type="button"
                    onClick={focusCatcher}
                    className="w-full py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium text-center hover:bg-amber-100 transition-colors animate-pulse"
                >
                    📱 Tap here to enable scanning
                </button>
            )}
        </div>
    )
}

export { SCAN_CATCHER_ID }
