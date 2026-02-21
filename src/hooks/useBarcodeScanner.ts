'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface BarcodeScannerOptions {
    /** Whether the scanner listener is active */
    enabled: boolean
    /** Callback fired with a validated barcode string */
    onScan: (barcode: string) => void
    /** ID of the scan-catcher input element (to allow capture even when focused) */
    scanCatcherInputId?: string
    /** Maximum inter-key time in ms to be considered a scanner burst (default: 50) */
    maxInterKeyMs?: number
    /** Idle timeout after last key to auto-emit barcode (default: 150) */
    idleTimeoutMs?: number
    /** Minimum barcode length (default: 4) */
    minLength?: number
    /** Maximum barcode length (default: 40) */
    maxLength?: number
    /** Debounce time for duplicate barcodes in ms (default: 2000) */
    dedupeMs?: number
}

/**
 * Hook that listens for HID barcode scanner input (keyboard wedge).
 *
 * Scanners send characters very rapidly (< 50ms between keys) and
 * typically end with Enter. This hook detects those rapid bursts and
 * emits the captured barcode string.
 *
 * Won't hijack normal typing: only captures when the active element is
 * the designated scan-catcher input OR is not a text input at all.
 */
export function useBarcodeScanner({
    enabled,
    onScan,
    scanCatcherInputId = 'barcode-scan-catcher',
    maxInterKeyMs = 50,
    idleTimeoutMs = 150,
    minLength = 4,
    maxLength = 40,
    dedupeMs = 2000,
}: BarcodeScannerOptions) {
    const bufferRef = useRef<string>('')
    const lastKeyTimeRef = useRef<number>(0)
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastBarcodeRef = useRef<string>('')
    const lastBarcodeTimeRef = useRef<number>(0)
    // Store callback in a ref to avoid re-attaching listener on every render
    const onScanRef = useRef(onScan)
    onScanRef.current = onScan

    const resetBuffer = useCallback(() => {
        bufferRef.current = ''
        lastKeyTimeRef.current = 0
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current)
            idleTimerRef.current = null
        }
    }, [])

    const emitBarcode = useCallback((raw: string) => {
        const barcode = raw.trim()
        if (barcode.length < minLength || barcode.length > maxLength) {
            return // not a valid scan
        }

        // Deduplicate
        const now = Date.now()
        if (barcode === lastBarcodeRef.current && now - lastBarcodeTimeRef.current < dedupeMs) {
            return
        }
        lastBarcodeRef.current = barcode
        lastBarcodeTimeRef.current = now

        onScanRef.current(barcode)
    }, [minLength, maxLength, dedupeMs])

    useEffect(() => {
        if (!enabled) {
            resetBuffer()
            return
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            // Determine if active element is a normal text input
            const active = document.activeElement
            const isInScanCatcher = active?.id === scanCatcherInputId
            const isInTextInput = active instanceof HTMLInputElement
                || active instanceof HTMLTextAreaElement
                || (active instanceof HTMLElement && active.isContentEditable)

            // Only capture if: in scan catcher, or NOT in any text input
            if (isInTextInput && !isInScanCatcher) {
                return
            }

            const now = Date.now()
            const timeSinceLast = now - lastKeyTimeRef.current

            // If Enter or Tab → might be end of scan
            if (e.key === 'Enter' || e.key === 'Tab') {
                if (bufferRef.current.length > 0) {
                    e.preventDefault()
                    e.stopPropagation()
                    emitBarcode(bufferRef.current)
                    resetBuffer()
                }
                return
            }

            // Ignore modifier keys, function keys, etc.
            if (e.key.length !== 1) return

            // If too much time has passed since last key, this is a new sequence
            if (bufferRef.current.length > 0 && timeSinceLast > maxInterKeyMs * 3) {
                // Previous buffer wasn't scanner-like, discard it
                resetBuffer()
            }

            bufferRef.current += e.key
            lastKeyTimeRef.current = now

            // If we're in the scan catcher, prevent the character from appearing twice
            // (the buffer captures it; we'll pass the full barcode)
            if (isInScanCatcher) {
                e.preventDefault()
            }

            // Set/reset idle timer
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
            idleTimerRef.current = setTimeout(() => {
                // Only emit if the burst was fast enough to be a scanner
                // (at least 3 chars typed rapidly)
                if (bufferRef.current.length >= 3) {
                    emitBarcode(bufferRef.current)
                }
                resetBuffer()
            }, idleTimeoutMs)
        }

        document.addEventListener('keydown', handleKeyDown, true)
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true)
            resetBuffer()
        }
    }, [enabled, scanCatcherInputId, maxInterKeyMs, idleTimeoutMs, emitBarcode, resetBuffer])
}
