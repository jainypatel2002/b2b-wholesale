'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

import { AuthCard } from '@/components/auth/AuthCard'
import { AuthShell } from '@/components/auth/AuthShell'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState('vendor')
  const [signupCode, setSignupCode] = useState('')

  async function signIn() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    window.location.href = '/'
  }

  async function signUp() {
    const selectedRole = role === 'distributor' ? 'distributor' : 'vendor'
    const trimmedCode = signupCode.trim()

    if (selectedRole === 'distributor' && !trimmedCode) {
      toast.error('Distributor signup code is required.')
      return
    }

    setLoading(true)

    if (selectedRole === 'distributor') {
      const { data: isCodeValid, error: validateError } = await supabase.rpc('validate_distributor_signup_code', {
        p_signup_code: trimmedCode
      })

      if (validateError || !isCodeValid) {
        setLoading(false)
        toast.error('Invalid or expired signup code. Contact admin.')
        return
      }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: selectedRole
        }
      }
    })

    if (error) {
      setLoading(false)
      toast.error(error.message)
      return
    }

    if (selectedRole === 'distributor') {
      const { error: redeemError } = await supabase.rpc('redeem_distributor_signup_code', {
        p_signup_code: trimmedCode,
        p_email: email.trim() || null,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      })

      if (redeemError) {
        setLoading(false)
        const normalizedMessage = redeemError.message.toLowerCase()
        if (normalizedMessage.includes('authentication')) {
          toast.error('Account created. Sign in after email confirmation and complete distributor onboarding with your signup code.')
        } else {
          toast.error('Invalid or expired signup code. Contact admin.')
        }
        return
      }
    }

    setLoading(false)
    setSignupCode('')

    if (selectedRole === 'distributor') {
      toast.success('Distributor account created. Sign in to continue.')
      return
    }

    toast.success('Account created. If email confirmations are enabled, check your email. Then sign in.')
  }

  return (
    <AuthShell>
      <AuthCard
        email={email}
        password={password}
        loading={loading}
        role={role}
        signupCode={signupCode}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onRoleChange={(value) => {
          setRole(value)
          if (value !== 'distributor') setSignupCode('')
        }}
        onSignupCodeChange={setSignupCode}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    </AuthShell>
  )
}
