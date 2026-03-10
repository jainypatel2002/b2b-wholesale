'use client'

import { motion } from 'framer-motion'

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
    </motion.section>
  )
}
