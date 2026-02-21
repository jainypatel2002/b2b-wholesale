'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'

interface CameraBarcodeScannerModalProps {
    open: boolean
    onClose: () => void
    onScan: (barcode: string) => void
}

/**
 * Modal that opens the device camera and scans barcodes using html5-qrcode.
 * Works on iPhone Safari, Android Chrome, and desktop webcams.
 *
 * Camera is only requested on user gesture (modal open).
 * Tracks are stopped on close/unmount to release camera.
 */
export function CameraBarcodeScannerModal({
    open,
    onClose,
    onScan,
}: CameraBarcodeScannerModalProps) {
    const [status, setStatus] = useState<'initializing' | 'scanning' | 'error' | 'permission_denied'>('initializing')
    const [errorMessage, setErrorMessage] = useState('')
    const scannerRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const hasScannedRef = useRef(false)

    const stopScanner = useCallback(async () => {
        try {
            if (scannerRef.current) {
                const state = scannerRef.current.getState?.()
                // Html5QrcodeScanner states: NOT_STARTED=1, SCANNING=2, PAUSED=3
                if (state === 2) {
                    await scannerRef.current.stop()
                }
                scannerRef.current.clear?.()
                scannerRef.current = null
            }
        } catch (e) {
            console.warn('Error stopping camera scanner:', e)
        }
    }, [])

    useEffect(() => {
        if (!open) {
            stopScanner()
            hasScannedRef.current = false
            setStatus('initializing')
            setErrorMessage('')
            return
        }

        let cancelled = false

        const startScanner = async () => {
            try {
                // Dynamic import to avoid SSR issues
                const { Html5Qrcode } = await import('html5-qrcode')

                if (cancelled) return

                const scannerId = 'camera-barcode-reader'

                // Ensure container exists
                if (!containerRef.current) return
                // Clear any previous scanner elements
                const existing = document.getElementById(scannerId)
                if (existing) existing.innerHTML = ''

                const html5Qrcode = new Html5Qrcode(scannerId)
                scannerRef.current = html5Qrcode

                await html5Qrcode.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 280, height: 150 },
                        aspectRatio: 1.5,
                        disableFlip: false,
                    },
                    (decodedText: string) => {
                        if (hasScannedRef.current) return
                        hasScannedRef.current = true

                        // Vibrate if supported (mobile haptic feedback)
                        if (navigator.vibrate) navigator.vibrate(100)

                        onScan(decodedText.trim())
                        // Stop scanner immediately after successful scan
                        stopScanner()
                        onClose()
                    },
                    () => {
                        // Ignore continuous scan failures (no barcode in frame)
                    }
                )

                if (!cancelled) {
                    setStatus('scanning')
                }
            } catch (err: any) {
                if (cancelled) return
                console.error('Camera scanner error:', err)

                const msg = String(err?.message || err || '')
                if (
                    msg.includes('NotAllowedError') ||
                    msg.includes('Permission') ||
                    msg.includes('denied')
                ) {
                    setStatus('permission_denied')
                    setErrorMessage('Camera access was denied. Please allow camera permission in your browser settings and try again.')
                } else if (msg.includes('NotFoundError') || msg.includes('No camera')) {
                    setStatus('error')
                    setErrorMessage('No camera found on this device.')
                } else {
                    setStatus('error')
                    setErrorMessage(msg || 'Failed to start camera. Please try again.')
                }
            }
        }

        // Small delay to let the modal DOM render
        const t = setTimeout(startScanner, 200)
        return () => {
            cancelled = true
            clearTimeout(t)
            stopScanner()
        }
    }, [open, onScan, onClose, stopScanner])

    if (!open) return null

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        📸 Camera Scanner
                    </h3>
                    <button
                        onClick={() => { stopScanner(); onClose() }}
                        className="text-slate-500 hover:text-slate-700 text-xl leading-none"
                    >
                        ✕
                    </button>
                </div>

                {/* Scanner Area */}
                <div className="p-4">
                    {status === 'initializing' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600" />
                            <p className="text-sm text-slate-600">Starting camera…</p>
                        </div>
                    )}

                    {status === 'permission_denied' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="text-4xl">🚫</div>
                            <p className="text-sm text-red-600 text-center font-medium">{errorMessage}</p>
                            <div className="text-xs text-slate-500 text-center space-y-1">
                                <p><strong>iPhone:</strong> Settings → Safari → Camera → Allow</p>
                                <p><strong>Android:</strong> Tap lock icon in URL bar → Permissions → Camera</p>
                                <p><strong>Desktop:</strong> Click camera icon in the address bar</p>
                            </div>
                            <button
                                onClick={() => { setStatus('initializing'); hasScannedRef.current = false }}
                                className="mt-2 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="text-4xl">⚠️</div>
                            <p className="text-sm text-red-600 text-center">{errorMessage}</p>
                            <button
                                onClick={() => { setStatus('initializing'); hasScannedRef.current = false }}
                                className="mt-2 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Video container — always rendered so html5-qrcode can mount */}
                    <div
                        ref={containerRef}
                        className={status === 'scanning' ? '' : 'hidden'}
                    >
                        <div
                            id="camera-barcode-reader"
                            className="rounded-lg overflow-hidden [&>video]:rounded-lg"
                        />
                        <p className="text-xs text-slate-500 text-center mt-3">
                            Point camera at a barcode. It will scan automatically.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t px-4 py-3 flex justify-end">
                    <button
                        onClick={() => { stopScanner(); onClose() }}
                        className="px-4 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
