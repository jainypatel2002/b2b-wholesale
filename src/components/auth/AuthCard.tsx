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
  signupCode: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onRoleChange: (value: string) => void
  onSignupCodeChange: (value: string) => void
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
  signupCode,
  onEmailChange,
  onPasswordChange,
  onRoleChange,
  onSignupCodeChange,
  onSignIn,
  onSignUp,
}: AuthCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const canAnimate = !prefersReducedMotion
  const [activeTab, setActiveTab] = useState<AuthTab>('sign-in')
  const requiresDistributorCode = activeTab === 'sign-up' && role === 'distributor'

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
      <Card className="rounded-[24px] border-white/18 bg-white/[0.12] text-white shadow-[0_26px_64px_-40px_rgba(2,6,23,0.95)] backdrop-blur-[18px] hover:translate-y-0 hover:shadow-[0_26px_64px_-40px_rgba(2,6,23,0.95)]">
        <CardHeader className="space-y-4 pb-5">
          <div
            role="tablist"
            aria-label="Authentication"
            className="grid grid-cols-2 rounded-xl border border-white/12 bg-white/[0.06] p-1"
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
                    'relative h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0',
                    isActive ? 'text-white' : 'text-white/70 hover:text-white/90'
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="auth-tab-indicator"
                      className="absolute inset-0 rounded-lg border border-white/20 bg-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                      transition={{ duration: canAnimate ? 0.22 : 0, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : null}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div>
            <CardTitle className="text-white">
              {activeTab === 'sign-in' ? 'Welcome back' : 'Create your account'}
            </CardTitle>
            <CardDescription className="mt-1 text-white/72">
              {activeTab === 'sign-in'
                ? 'Sign in to manage your distributor and vendor workflows.'
                : 'Set up access for your role in the portal.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="text-sm font-medium text-white/85">
                Email
              </label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                className="h-11 border-white/22 bg-white/[0.11] text-white placeholder:text-white/45 focus-visible:border-white/45 focus-visible:ring-white/35 focus-visible:ring-offset-0"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="text-sm font-medium text-white/85">
                Password
              </label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={activeTab === 'sign-in' ? 'current-password' : 'new-password'}
                className="h-11 border-white/22 bg-white/[0.11] text-white placeholder:text-white/45 focus-visible:border-white/45 focus-visible:ring-white/35 focus-visible:ring-offset-0"
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
              {role === 'distributor' ? (
                <div className="space-y-1.5">
                  <label htmlFor="distributor-signup-code" className="text-sm font-medium text-white/85">
                    Distributor Signup Code
                  </label>
                  <Input
                    id="distributor-signup-code"
                    type="text"
                    autoComplete="off"
                    className="h-11 border-white/22 bg-white/[0.11] font-mono uppercase text-white placeholder:text-white/45 focus-visible:border-white/45 focus-visible:ring-white/35 focus-visible:ring-offset-0"
                    placeholder="Enter your invite code"
                    value={signupCode}
                    onChange={(event) => onSignupCodeChange(event.target.value.toUpperCase())}
                  />
                </div>
              ) : null}
              <p className="-mt-3 text-xs text-white/72">
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

            <Button type="submit" className="h-11 w-full" disabled={loading || (requiresDistributorCode && !signupCode.trim())}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {activeTab === 'sign-in' ? 'Sign in' : `Create account (${role})`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
