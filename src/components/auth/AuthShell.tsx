'use client'

import { type ReactNode } from 'react'

import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthHeader } from '@/components/auth/AuthHeader'
import { ConnectionGuidePanel } from '@/components/auth/ConnectionGuidePanel'

interface AuthShellProps {
  children: ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-slate-950">
      <AuthBackground />

      <section className="relative z-10 px-4 pb-6 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:px-10 lg:py-10">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 sm:gap-10 lg:justify-center">
          <AuthHeader />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:gap-10">
            <div className="order-1 min-w-0">
              <div className="relative mx-auto w-full max-w-[560px] lg:mx-0">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 inset-y-8 -z-10 rounded-[30px] bg-gradient-to-b from-black/30 to-black/12 blur-3xl"
                />
                {children}
              </div>
            </div>

            <div className="order-2 min-w-0">
              <div className="mx-auto w-full max-w-3xl lg:mx-0">
                <ConnectionGuidePanel />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
