'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

import { AuthCard } from '@/components/auth/AuthCard'
import { AuthShell } from '@/components/auth/AuthShell'

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
    <AuthShell>
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
    </AuthShell>
  )
}
