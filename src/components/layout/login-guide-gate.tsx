'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { acquireBodyScrollLock } from '@/lib/ui/scroll-lock'
import { LOGIN_GUIDE_PENDING_STORAGE_KEY } from '@/lib/login-guide'

type Role = 'distributor' | 'vendor'

type LoginGuideGateProps = {
  role: Role
  distributorCode: string | null
}

const GUIDE_COPY = {
  vendor: {
    title: 'Connect to a Distributor',
    description:
      "Use your distributor's unique code to connect your vendor account and access the products and pricing shared with you.",
    steps: [
      'Ask your distributor for their unique distributor code.',
      'Open the connect distributor section from your vendor dashboard.',
      'Enter the code exactly as given.',
      'Submit the code to connect your account.',
      "After approval or successful linking, you will be able to access the distributor's shared catalog and settings available to you.",
    ],
    note:
      'If the code does not work, double-check it with your distributor and make sure you are using the correct account.',
  },
  distributor: {
    title: 'Connect Vendors Using Your Code',
    description:
      'Share your distributor code with vendors so they can connect their vendor accounts to your business.',
    steps: [
      'Copy your unique distributor code.',
      'Share the code only with vendors you want to connect.',
      'Ask the vendor to log in to their vendor account.',
      'The vendor enters your code in their connect distributor section.',
      'Once connected, that vendor can access the products, pricing, and visibility settings you allow.',
    ],
    note:
      'Only share your code with approved vendors. Product access and vendor visibility still follow your distributor settings.',
  },
} as const

export function LoginGuideGate({ role, distributorCode }: LoginGuideGateProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const panelRef = useRef<HTMLDivElement>(null)
  const hasCheckedPendingRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const content = GUIDE_COPY[role]
  const isDistributor = role === 'distributor'
  const canGoToConnect = role === 'vendor' && pathname !== '/vendor/settings/connect'

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || hasCheckedPendingRef.current) return
    hasCheckedPendingRef.current = true

    try {
      if (window.sessionStorage.getItem(LOGIN_GUIDE_PENDING_STORAGE_KEY) !== '1') return

      window.sessionStorage.removeItem(LOGIN_GUIDE_PENDING_STORAGE_KEY)
      setOpen(true)
    } catch {
      // Ignore storage failures so auth and navigation remain unaffected.
    }
  }, [mounted])

  useEffect(() => {
    if (!mounted || !open) return
    return acquireBodyScrollLock()
  }, [mounted, open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[140] bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false)
        }
      }}
    >
      <div className="mx-auto flex h-full w-full items-start justify-center overflow-y-auto py-3 sm:py-6">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="w-full max-w-2xl rounded-[28px] border border-white/75 bg-white shadow-2xl outline-none"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-4 py-4 sm:px-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                {isDistributor ? 'Distributor Guide' : 'Vendor Guide'}
              </div>
              <div className="space-y-1">
                <h2 id={titleId} className="text-xl font-semibold text-slate-900 sm:text-2xl">
                  {content.title}
                </h2>
                <p id={descriptionId} className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                  {content.description}
                </p>
              </div>
            </div>

            <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close guide">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="space-y-5">
              {isDistributor && (
                <div className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Your Distributor Code
                      </p>
                      {distributorCode ? (
                        <>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-lg font-semibold tracking-[0.18em] text-slate-900 shadow-sm break-all sm:text-xl">
                            {distributorCode}
                          </div>
                          <p className="text-sm text-slate-600">
                            Vendors use this code from their side to connect to your business.
                          </p>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                          Your code is not available right now. You can still share it later from your distributor settings page.
                        </div>
                      )}
                    </div>

                    {distributorCode && <CopyButton text={distributorCode} label="Copy Code" className="w-full sm:w-auto" />}
                  </div>
                </div>
              )}

              <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                <ol className="space-y-3">
                  {content.steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <span className="text-sm leading-6 text-slate-700 sm:text-[15px]">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-3xl border border-sky-100 bg-sky-50/90 p-4 text-sm leading-6 text-sky-950">
                {content.note}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto">
                  Got it
                </Button>

                {canGoToConnect && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setOpen(false)
                      router.push('/vendor/settings/connect')
                    }}
                  >
                    Go to Connect
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
