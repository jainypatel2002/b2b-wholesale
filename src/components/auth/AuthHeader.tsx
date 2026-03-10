'use client'

import { ThreeDTitle } from '@/components/auth/ThreeDTitle'

export function AuthHeader() {
  return (
    <header className="max-w-[42rem] space-y-5">
      <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100/95">
        Your Platform
      </p>

      <div className="space-y-4">
        <ThreeDTitle className="max-w-[14ch] text-[clamp(1.95rem,8vw,4.2rem)]" />
        <p className="max-w-2xl text-sm leading-relaxed text-slate-200/90 sm:text-base">
          Connect distributors and vendors through one reliable workflow for orders, inventory, and fulfillment.
        </p>
      </div>

      <div className="grid gap-2.5 text-sm text-slate-200/90 sm:grid-cols-2">
        <p className="w-fit rounded-xl border border-white/15 bg-white/5 px-3 py-2">
          Unified ordering visibility from quote to delivery.
        </p>
        <p className="w-fit rounded-xl border border-white/15 bg-white/5 px-3 py-2">
          Role-aware onboarding for distributor and vendor teams.
        </p>
      </div>
    </header>
  )
}
