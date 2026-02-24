'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

import { AuthCard } from '@/components/auth/AuthCard'
import { BrandPanel } from '@/components/auth/BrandPanel'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState('vendor')

  async function signIn() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return alert(error.message)
    window.location.href = '/'
  }

  async function signUp() {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: role // Pass selected role to metadata
        }
      }
    })
    setLoading(false)
    if (error) return alert(error.message)
    alert('Account created. If email confirmations are enabled, check your email. Then sign in.')
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-12 lg:gap-8">
        <BrandPanel className="lg:col-span-5" />

        <section className="flex items-center justify-center lg:col-span-7">
          <AuthCard
            email={email}
            password={password}
            loading={loading}
            role={role}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onRoleChange={setRole}
            onSignIn={signIn}
            onSignUp={signUp}
          />
        </section>
      </div>
    </main>
  )
}
