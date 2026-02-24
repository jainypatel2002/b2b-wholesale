'use client'

import { type ReactNode } from 'react'

import { AuthBackground } from '@/components/auth/AuthBackground'

interface AuthShellProps {
  children: ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-950">
      <AuthBackground />

      <section className="relative z-10 flex min-h-[100dvh] items-end justify-center px-4 pb-6 pt-36 sm:px-6 sm:pb-10 sm:pt-32 lg:items-center lg:justify-end lg:px-10 lg:py-10">
        <div className="relative w-full max-w-[560px] lg:mr-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 inset-y-8 -z-10 rounded-[30px] bg-gradient-to-b from-black/30 to-black/12 blur-3xl"
          />
          {children}
        </div>
      </section>
    </main>
  )
}
