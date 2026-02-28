'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { acquireBodyScrollLock } from '@/lib/ui/scroll-lock'

type CameraStatus = 'idle' | 'starting' | 'active' | 'scanning_success' | 'error' | 'permission_denied' | 'insecure_context' | 'no_camera_api'

interface CameraBarcodeScannerModalProps {
    /** Pass a pre-obtained MediaStream to preserve iOS user gesture context */
    stream: MediaStream | null
    /** Error message from getUserMedia failure (set by parent in click handler) */
    cameraError: string | null
    open: boolean
    onClose: () => void
    onScan: (barcode: string) => void
    onUseManualInput?: () => void
}

/**
 * Camera barcode scanner modal.
 *
 * CRITICAL DESIGN: The parent calls getUserMedia() directly in the click
 * handler and passes the resulting stream as a prop. This preserves the
 * iOS Safari user-gesture requirement for camera permissions.
 *
 * This component only manages: video rendering, barcode scanning loop,
 * stream cleanup on close.
 */
export function CameraBarcodeScannerModal({
    stream,
    cameraError,
    open,
    onClose,
    onScan,
    onUseManualInput,
}: CameraBarcodeScannerModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const scanLoopRef = useRef<number | null>(null)
    const hasScannedRef = useRef(false)
    const [mounted, setMounted] = useState(false)
    const [status, setStatus] = useState<CameraStatus>('idle')
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted || !open) return
        return acquireBodyScrollLock()
    }, [mounted, open])

    // ── Stop scanning loop ──
    const stopScanLoop = useCallback(() => {
        if (scanLoopRef.current !== null) {
            cancelAnimationFrame(scanLoopRef.current)
            scanLoopRef.current = null
        }
    }, [])

    // ── Stop all tracks and clean up ──
    const stopStream = useCallback((s: MediaStream | null) => {
        if (s) {
            s.getTracks().forEach(track => {
                track.stop()
                console.info('[CameraScanner] Track stopped:', track.label)
            })
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
    }, [])

    // ── Handle close with full cleanup ──
    const handleClose = useCallback(() => {
        console.info('[CameraScanner] Closing modal')
        stopScanLoop()
        stopStream(stream)
        hasScannedRef.current = false
        setStatus('idle')
        setErrorMsg('')
        onClose()
    }, [stream, stopScanLoop, stopStream, onClose])

    // ── Barcode scanning loop using BarcodeDetector or canvas fallback ──
    const startScanLoop = useCallback((video: HTMLVideoElement) => {
        console.info('[CameraScanner] Starting scan loop')

        // Check for native BarcodeDetector
        const hasBarcodeDetector = typeof (window as any).BarcodeDetector !== 'undefined'
        let detector: any = null
        if (hasBarcodeDetector) {
            try {
                detector = new (window as any).BarcodeDetector({
                    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code', 'data_matrix']
                })
                console.info('[CameraScanner] Using native BarcodeDetector')
            } catch {
                detector = null
            }
        }

        // Fallback: try html5-qrcode decoder
        let html5QrcodeDecoder: any = null
        if (!detector) {
            import('html5-qrcode').then(({ Html5Qrcode }) => {
                html5QrcodeDecoder = Html5Qrcode
                console.info('[CameraScanner] Using html5-qrcode fallback decoder')
            }).catch(() => {
                console.warn('[CameraScanner] html5-qrcode not available for fallback')
            })
        }

        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        let lastScanTime = 0
        const SCAN_INTERVAL = 250 // ms between scan attempts

        const scanFrame = async () => {
            if (hasScannedRef.current || video.paused || video.ended) {
                return
            }

            const now = Date.now()
            if (now - lastScanTime < SCAN_INTERVAL) {
                scanLoopRef.current = requestAnimationFrame(scanFrame)
                return
            }
            lastScanTime = now

            // Draw video frame to canvas
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            if (canvas.width === 0 || canvas.height === 0) {
                scanLoopRef.current = requestAnimationFrame(scanFrame)
                return
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

            try {
                if (detector) {
                    // Native BarcodeDetector
                    const barcodes = await detector.detect(canvas)
                    if (barcodes.length > 0) {
                        const barcode = barcodes[0].rawValue?.trim()
                        if (barcode && barcode.length >= 4) {
                            console.info('[CameraScanner] Barcode detected:', barcode)
                            hasScannedRef.current = true
                            if (navigator.vibrate) navigator.vibrate(100)
                            onScan(barcode)
                            stopScanLoop()
                            stopStream(stream)
                            setStatus('scanning_success')
                            return
                        }
                    }
                } else if (html5QrcodeDecoder) {
                    // Fallback: canvas → blob → html5-qrcode scanFile
                    const blob = await new Promise<Blob | null>((resolve) => {
                        canvas.toBlob(resolve, 'image/png')
                    })
                    if (blob && !hasScannedRef.current) {
                        const file = new File([blob], 'frame.png', { type: 'image/png' })
                        try {
                            const qrcode = new html5QrcodeDecoder('html5qr-hidden')
                            const result = await qrcode.scanFileV2(file, false)
                            const barcode = result?.decodedText?.trim()
                            if (barcode && barcode.length >= 4) {
                                console.info('[CameraScanner] Barcode detected (html5-qrcode):', barcode)
                                hasScannedRef.current = true
                                if (navigator.vibrate) navigator.vibrate(100)
                                onScan(barcode)
                                stopScanLoop()
                                stopStream(stream)
                                qrcode.clear()
                                setStatus('scanning_success')
                                return
                            }
                            qrcode.clear()
                        } catch {
                            // No barcode in this frame — expected
                        }
                    }
                }
            } catch {
                // Frame decode failed — continue scanning
            }

            scanLoopRef.current = requestAnimationFrame(scanFrame)
        }

        scanLoopRef.current = requestAnimationFrame(scanFrame)
    }, [onScan, stopScanLoop, stopStream, stream])

    // ── Attach stream to video when it arrives ──
    useEffect(() => {
        if (!open) {
            stopScanLoop()
            hasScannedRef.current = false
            setStatus('idle')
            setErrorMsg('')
            return
        }

        // Handle error from parent (getUserMedia failure)
        if (cameraError) {
            const err = cameraError.toLowerCase()
            if (err.includes('notallowed') || err.includes('permission') || err.includes('denied')) {
                setStatus('permission_denied')
                setErrorMsg('Camera permission denied. Enable it in browser settings and retry.')
            } else if (err.includes('notfound') || err.includes('no camera')) {
                setStatus('error')
                setErrorMsg('No camera found on this device.')
            } else if (err.includes('notreadable') || err.includes('in use')) {
                setStatus('error')
                setErrorMsg('Camera is in use by another app.')
            } else if (err.includes('secure') || err.includes('https')) {
                setStatus('insecure_context')
                setErrorMsg('Camera requires HTTPS or localhost. Open the site using https:// or run on localhost.')
            } else {
                setStatus('error')
                setErrorMsg(cameraError)
            }
            return
        }

        if (!stream) {
            setStatus('starting')
            return
        }

        // Stream is available — attach to video
        const video = videoRef.current
        if (!video) return

        console.info('[CameraScanner] Attaching stream to video element')
        setStatus('active')

        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        video.muted = true

        const handlePlaying = () => {
            console.info('[CameraScanner] Video playing, starting scan loop')
            startScanLoop(video)
        }

        video.onloadedmetadata = () => {
            console.info('[CameraScanner] Video metadata loaded')
            video.play().then(() => {
                console.info('[CameraScanner] video.play() resolved')
                handlePlaying()
            }).catch((e) => {
                console.error('[CameraScanner] video.play() failed:', e.name, e.message)
                setStatus('error')
                setErrorMsg('Could not start video playback. Try tapping the video area.')
            })
        }

        return () => {
            stopScanLoop()
        }
    }, [open, stream, cameraError, startScanLoop, stopScanLoop])

    // ── Cleanup on unmount ──
    useEffect(() => {
        return () => {
            stopScanLoop()
            // Don't stop stream here — parent manages stream lifecycle
        }
    }, [stopScanLoop])

    useEffect(() => {
        if (!open) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') handleClose()
        }

        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [handleClose, open])

    if (!mounted || !open) return null

    return createPortal(
        <div
            className="fixed inset-0 z-[130] bg-black/70 p-3 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) handleClose()
            }}
        >
            <div className="mx-auto flex h-full w-full items-start justify-center overflow-y-auto pt-2 sm:pt-6">
                <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <h3 className="text-lg font-semibold">Camera Scanner</h3>
                        <button
                            onClick={handleClose}
                            className="p-1 text-xl leading-none text-slate-500 hover:text-slate-700"
                            aria-label="Close camera scanner"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Scanner Area */}
                    <div className="p-4">
                        {/* Insecure context error */}
                        {status === 'insecure_context' && (
                            <div className="flex flex-col items-center gap-3 py-6">
                                <div className="text-4xl">🔒</div>
                                <p className="text-center text-sm font-medium text-red-600">{errorMsg}</p>
                                <div className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
                                    <p>Camera API only works on:</p>
                                    <p className="mt-1 font-mono">https://yourdomain.com</p>
                                    <p className="font-mono">http://localhost:3000</p>
                                </div>
                            </div>
                        )}

                        {/* Starting / waiting */}
                        {status === 'starting' && (
                            <div className="flex flex-col items-center gap-3 py-8">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                                <p className="text-sm text-slate-600">Starting camera…</p>
                            </div>
                        )}

                        {/* Permission denied */}
                        {status === 'permission_denied' && (
                            <div className="flex flex-col items-center gap-3 py-6">
                                <div className="text-4xl">🚫</div>
                                <p className="text-center text-sm font-medium text-red-600">{errorMsg}</p>
                                <div className="space-y-1 text-center text-xs text-slate-500">
                                    <p><strong>iPhone:</strong> Settings → Safari → Camera → Allow</p>
                                    <p><strong>Android:</strong> Tap lock icon in URL bar → Permissions → Camera</p>
                                    <p><strong>Desktop:</strong> Click camera icon in the address bar</p>
                                </div>
                            </div>
                        )}

                        {/* Generic error */}
                        {status === 'error' && (
                            <div className="flex flex-col items-center gap-3 py-6">
                                <div className="text-4xl">⚠️</div>
                                <p className="text-center text-sm text-red-600">{errorMsg}</p>
                            </div>
                        )}

                        {/* Video element — always rendered so srcObject can be set immediately */}
                        <div className={(status === 'active' || status === 'scanning_success') ? '' : 'hidden'}>
                            <div className="relative overflow-hidden rounded-lg bg-black" style={{ minHeight: '320px' }}>
                                <video
                                    ref={videoRef}
                                    playsInline
                                    muted
                                    autoPlay
                                    className="h-auto w-full rounded-lg"
                                    style={{ minHeight: '320px', objectFit: 'cover' }}
                                />
                                {/* Scan overlay guide */}
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <div className="rounded-lg border-2 border-white/60" style={{ width: '70%', height: '35%' }} />
                                </div>
                            </div>
                            <p className="mt-3 text-center text-xs text-slate-500">
                                Point camera at a barcode. It will scan automatically.
                            </p>
                        </div>

                        {/* Hidden canvas for barcode detection */}
                        <canvas ref={canvasRef} className="hidden" />
                        {/* Hidden div for html5-qrcode fallback decoder */}
                        <div id="html5qr-hidden" className="hidden" />
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between border-t px-4 py-3">
                        {onUseManualInput ? (
                            <button
                                onClick={() => {
                                    onUseManualInput()
                                    handleClose()
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Use Manual Input
                            </button>
                        ) : (
                            <span />
                        )}
                        <button
                            onClick={handleClose}
                            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
