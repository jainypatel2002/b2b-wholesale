'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createBrowserClient } from '@supabase/ssr'

export function NotificationEmailForm({ currentEmail, loginEmail }: { currentEmail: string | null; loginEmail: string | null }) {
    const [email, setEmail] = useState(currentEmail || '')
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    async function handleSave() {
        setSaving(true)
        setMessage(null)
        try {
            const supabase = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            )
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const trimmed = email.trim()

            // If empty or same as login email, set to null (use default)
            const value = (!trimmed || trimmed === loginEmail) ? null : trimmed

            const { error } = await supabase
                .from('profiles')
                .update({ notification_email: value })
                .eq('id', user.id)

            if (error) throw error
            setMessage({ type: 'success', text: 'Notification email updated.' })
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message || 'Failed to save' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Notification Email</label>
                <p className="text-xs text-slate-500">
                    Order notifications will be sent to this email. Leave empty to use your login email ({loginEmail}).
                </p>
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={loginEmail || 'your@email.com'}
                />
            </div>
            {message && (
                <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {message.text}
                </p>
            )}
            <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? 'Saving...' : 'Save'}
            </Button>
        </div>
    )
}
