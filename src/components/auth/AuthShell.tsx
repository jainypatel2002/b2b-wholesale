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

      <section className="relative z-10 flex min-h-[100dvh] items-end justify-center px-4 pb-5 pt-28 sm:px-6 sm:pb-10 sm:pt-24 lg:items-center lg:px-10 lg:py-10">
        <div className="w-full max-w-[560px] rounded-[28px] border border-white/20 bg-white/10 p-2 shadow-[0_24px_55px_-34px_rgba(2,6,23,0.85)] backdrop-blur-sm sm:p-3">
          {children}
        </div>
      </section>
    </main>
  )
}
