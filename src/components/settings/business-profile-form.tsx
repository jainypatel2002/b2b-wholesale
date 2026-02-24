'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { upsertMyBusinessProfileAction } from '@/app/actions/business-profile'
import type { BusinessProfileData } from '@/lib/business-profiles'

interface BusinessProfileFormProps {
  initialProfile: BusinessProfileData
}

type BusinessProfileFormState = {
  business_name: string
  contact_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  tax_id: string
}

function toFormState(profile: BusinessProfileData): BusinessProfileFormState {
  return {
    business_name: profile.business_name || '',
    contact_name: profile.contact_name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    address_line1: profile.address_line1 || '',
    address_line2: profile.address_line2 || '',
    city: profile.city || '',
    state: profile.state || '',
    postal_code: profile.postal_code || '',
    country: profile.country || 'USA',
    tax_id: profile.tax_id || ''
  }
}

export function BusinessProfileForm({ initialProfile }: BusinessProfileFormProps) {
  const [form, setForm] = useState<BusinessProfileFormState>(() => toFormState(initialProfile))
  const [initial, setInitial] = useState<BusinessProfileFormState>(() => toFormState(initialProfile))
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    const next = toFormState(initialProfile)
    setForm(next)
    setInitial(next)
    setErrors([])
  }, [initialProfile.user_id, initialProfile.updated_at])

  const isDirty = useMemo(() => {
    return Object.keys(initial).some((key) => {
      const typedKey = key as keyof BusinessProfileFormState
      return initial[typedKey] !== form[typedKey]
    })
  }, [form, initial])

  function updateField(field: keyof BusinessProfileFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setIsSaving(true)
    setErrors([])

    try {
      const formData = new FormData()
      formData.set('business_name', form.business_name)
      formData.set('contact_name', form.contact_name)
      formData.set('email', form.email)
      formData.set('phone', form.phone)
      formData.set('address_line1', form.address_line1)
      formData.set('address_line2', form.address_line2)
      formData.set('city', form.city)
      formData.set('state', form.state)
      formData.set('postal_code', form.postal_code)
      formData.set('country', form.country)
      formData.set('tax_id', form.tax_id)
      formData.set('notes', '')

      const result = await upsertMyBusinessProfileAction(formData)
      if (!result.success) {
        setErrors(result.errors || [result.message])
        toast.error(result.message)
        return
      }

      setInitial(form)
      setErrors([])
      toast.success(result.message)
    } catch (error) {
      console.error('[BusinessProfileForm] Save failed:', error)
      setErrors(['An unexpected error occurred while saving.'])
      toast.error('Failed to save business profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="business_name" className="text-sm font-medium">Business Name *</label>
          <Input
            id="business_name"
            value={form.business_name}
            onChange={(e) => updateField('business_name', e.target.value)}
            placeholder="e.g. Acme Distribution"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="contact_name" className="text-sm font-medium">Contact Name</label>
          <Input
            id="contact_name"
            value={form.contact_name}
            onChange={(e) => updateField('contact_name', e.target.value)}
            placeholder="e.g. Jane Doe"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="tax_id" className="text-sm font-medium">Tax ID</label>
          <Input
            id="tax_id"
            value={form.tax_id}
            onChange={(e) => updateField('tax_id', e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email *</label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="billing@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium">Phone *</label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="(555) 123-4567"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="address_line1" className="text-sm font-medium">Address Line 1 *</label>
          <Input
            id="address_line1"
            value={form.address_line1}
            onChange={(e) => updateField('address_line1', e.target.value)}
            placeholder="Street address"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="address_line2" className="text-sm font-medium">Address Line 2</label>
          <Input
            id="address_line2"
            value={form.address_line2}
            onChange={(e) => updateField('address_line2', e.target.value)}
            placeholder="Suite, unit, etc. (optional)"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="city" className="text-sm font-medium">City *</label>
          <Input
            id="city"
            value={form.city}
            onChange={(e) => updateField('city', e.target.value)}
            placeholder="City"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="state" className="text-sm font-medium">State *</label>
          <Input
            id="state"
            value={form.state}
            onChange={(e) => updateField('state', e.target.value)}
            placeholder="State"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="postal_code" className="text-sm font-medium">Postal Code *</label>
          <Input
            id="postal_code"
            value={form.postal_code}
            onChange={(e) => updateField('postal_code', e.target.value)}
            placeholder="ZIP / Postal code"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="country" className="text-sm font-medium">Country</label>
          <Input
            id="country"
            value={form.country}
            onChange={(e) => updateField('country', e.target.value)}
            placeholder="USA"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving || !isDirty}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Business Profile
        </Button>
        <p className="text-xs text-slate-500">* Required for invoice headers.</p>
      </div>
    </div>
  )
}
