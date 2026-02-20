'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

import { RoleSelector } from '@/components/auth/role-selector'

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
    <div className="mx-auto max-w-md p-6">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold mb-6">Sign in</h1>

        <RoleSelector onSelect={setRole} initialRole="vendor" />

        <p className="mt-2 text-sm text-slate-600 mb-4">
          {role === 'distributor' ? 'Distributor Portal' : 'Vendor Portal'}
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label className="text-sm">Email</label>
            <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <button className="btn w-full" disabled={loading} onClick={signIn}>Sign in</button>
          <button className="btn w-full" disabled={loading} onClick={signUp}>Create account ({role})</button>

          <p className="text-xs text-slate-500">
            Tip: You can enable/disable email confirmation in Supabase Auth settings.
          </p>
        </div>
      </div>
    </div>
  )
}
