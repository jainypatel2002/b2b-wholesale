'use client'

import { motion } from 'framer-motion'

import { ThreeDTitle } from '@/components/auth/ThreeDTitle'
import { usePrefersReducedMotion } from '@/components/auth/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

export function AuthBackground() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const canAnimate = !prefersReducedMotion

  return (
    <motion.section
      aria-hidden
      className="absolute inset-0 z-0 overflow-hidden"
      initial={canAnimate ? { opacity: 0.88 } : { opacity: 1 }}
      animate={{ opacity: 1 }}
      transition={{ duration: canAnimate ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          'auth-brand-background absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(59,130,246,0.28),transparent_44%),radial-gradient(circle_at_82%_16%,rgba(20,184,166,0.22),transparent_40%),linear-gradient(145deg,#020617_2%,#0f172a_38%,#111827_100%)]',
          canAnimate ? 'auth-brand-background-motion' : undefined
        )}
      />
      <div className="auth-grid-overlay pointer-events-none absolute inset-0 opacity-20" />
      <div className="absolute inset-0 bg-slate-950/45" />
      <div
        className={cn(
          'absolute -left-20 top-10 h-64 w-64 rounded-full bg-cyan-400/16 blur-3xl',
          canAnimate ? 'auth-blob-one-motion' : undefined
        )}
      />
      <div
        className={cn(
          'absolute bottom-0 right-0 h-80 w-80 translate-x-1/4 translate-y-1/4 rounded-full bg-blue-300/15 blur-3xl',
          canAnimate ? 'auth-blob-two-motion' : undefined
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-950/25 to-transparent" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-start px-5 pb-28 pt-8 sm:px-8 sm:pt-10 lg:items-center lg:px-10 lg:pb-10 lg:pt-10">
        <div className="max-w-[28rem]">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100/95">
            Your Platform
          </p>
          <ThreeDTitle className="mt-4 max-w-[14ch] text-[clamp(1.95rem,8vw,4.2rem)]" />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200/90 sm:text-base">
            Connect distributors and vendors through one reliable workflow for orders, inventory, and fulfillment.
          </p>
          <div className="mt-5 grid gap-2.5 text-sm text-slate-200/90">
            <p className="w-fit rounded-xl border border-white/15 bg-white/5 px-3 py-2">
              Unified ordering visibility from quote to delivery.
            </p>
            <p className="w-fit rounded-xl border border-white/15 bg-white/5 px-3 py-2">
              Role-aware onboarding for distributor and vendor teams.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
