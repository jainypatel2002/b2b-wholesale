'use client'

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'

import { RoleSelector } from '@/components/auth/role-selector'
import { usePrefersReducedMotion } from '@/components/auth/usePrefersReducedMotion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type AuthTab = 'sign-in' | 'sign-up'

interface AuthCardProps {
  email: string
  password: string
  loading: boolean
  role: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onRoleChange: (value: string) => void
  onSignIn: () => Promise<void>
  onSignUp: () => Promise<void>
}

const TABS: Array<{ id: AuthTab; label: string }> = [
  { id: 'sign-in', label: 'Sign In' },
  { id: 'sign-up', label: 'Sign Up' },
]

export function AuthCard({
  email,
  password,
  loading,
  role,
  onEmailChange,
  onPasswordChange,
  onRoleChange,
  onSignIn,
  onSignUp,
}: AuthCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const canAnimate = !prefersReducedMotion
  const [activeTab, setActiveTab] = useState<AuthTab>('sign-in')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (activeTab === 'sign-in') {
      await onSignIn()
      return
    }

    await onSignUp()
  }

  return (
    <motion.div
      className="w-full max-w-[520px]"
      initial={canAnimate ? { opacity: 0, y: 18 } : { opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: canAnimate ? 0.35 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="rounded-2xl border-slate-200 bg-white shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] hover:translate-y-0 hover:shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)]">
        <CardHeader className="space-y-4 pb-5">
          <div
            role="tablist"
            aria-label="Authentication"
            className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100/90 p-1"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${tab.id}-panel`}
                  id={`${tab.id}-tab`}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
                    isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="auth-tab-indicator"
                      className="absolute inset-0 rounded-lg border border-slate-200 bg-white shadow-sm"
                      transition={{ duration: canAnimate ? 0.22 : 0, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : null}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div>
            <CardTitle>{activeTab === 'sign-in' ? 'Welcome back' : 'Create your account'}</CardTitle>
            <CardDescription className="mt-1">
              {activeTab === 'sign-in'
                ? 'Sign in to manage your distributor and vendor workflows.'
                : 'Set up access for your role in the portal.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                className="h-11"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={activeTab === 'sign-in' ? 'current-password' : 'new-password'}
                className="h-11"
                placeholder="••••••••"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
              />
            </div>

            <div
              id="sign-up-panel"
              role="tabpanel"
              aria-labelledby="sign-up-tab"
              hidden={activeTab !== 'sign-up'}
              className="space-y-3"
            >
              <RoleSelector onSelect={onRoleChange} initialRole={role} />
              <p className="-mt-3 text-xs text-slate-600">
                {role === 'distributor' ? 'Distributor Portal' : 'Vendor Portal'}
              </p>
            </div>

            <div
              id="sign-in-panel"
              role="tabpanel"
              aria-labelledby="sign-in-tab"
              hidden={activeTab !== 'sign-in'}
              className="sr-only"
            />

            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {activeTab === 'sign-in' ? 'Sign in' : `Create account (${role})`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
