'use client'

import { motion } from 'framer-motion'

import { ThreeDTitle } from '@/components/auth/ThreeDTitle'
import { usePrefersReducedMotion } from '@/components/auth/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

interface BrandPanelProps {
  className?: string
}

export function BrandPanel({ className }: BrandPanelProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const canAnimate = !prefersReducedMotion

  return (
    <motion.aside
      className={cn(
        'relative isolate min-h-[250px] overflow-hidden rounded-[28px] border border-slate-700/60 shadow-[0_28px_70px_-45px_rgba(15,23,42,0.95)] lg:min-h-[640px]',
        className
      )}
      initial={canAnimate ? { opacity: 0, x: -16 } : { opacity: 1, x: 0 }}
      animate={canAnimate ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
      transition={{ duration: canAnimate ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          'auth-brand-background absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(71,85,105,0.45),transparent_48%),radial-gradient(circle_at_88%_18%,rgba(8,145,178,0.38),transparent_44%),linear-gradient(140deg,#0f172a_8%,#111827_46%,#020617_100%)]',
          canAnimate ? 'auth-brand-background-motion' : undefined
        )}
      />
      <div className="auth-grid-overlay pointer-events-none absolute inset-0 opacity-15" />
      <div
        className={cn(
          'absolute -left-16 top-12 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl',
          canAnimate ? 'auth-blob-one-motion' : undefined
        )}
      />
      <div
        className={cn(
          'absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full bg-blue-300/15 blur-3xl',
          canAnimate ? 'auth-blob-two-motion' : undefined
        )}
      />

      <div className="relative z-10 flex h-full flex-col justify-between gap-6 p-6 text-white md:p-8 lg:p-10">
        <div>
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100/95">
            Your Platform
          </p>
          <ThreeDTitle className="mt-5 max-w-[14ch]" />
          <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-200/90 md:text-base">
            Connect distributors and vendors through one reliable workflow for orders, inventory, and fulfillment.
          </p>
        </div>

        <div className="grid gap-2.5 text-sm text-slate-200/90">
          <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">Unified ordering visibility from quote to delivery.</p>
          <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">Role-aware onboarding for vendor and distributor teams.</p>
        </div>
      </div>
    </motion.aside>
  )
}
