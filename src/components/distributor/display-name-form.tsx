'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateDisplayName } from '@/app/(protected)/distributor/settings/actions'

export function DisplayNameForm({ initialName }: { initialName: string }) {
    const [name, setName] = useState(initialName)
    const [isLoading, setIsLoading] = useState(false)

    async function handleSave() {
        if (name.length > 60) {
            toast.error("Display name is too long")
            return
        }

        setIsLoading(true)
        try {
            const formData = new FormData()
            formData.append('display_name', name)

            const result = await updateDisplayName(formData)

            if (result.success) {
                toast.success(result.message)
            } else {
                toast.error(result.message)
                setName(initialName)
            }
        } catch (err) {
            toast.error("An unexpected error occurred.")
            setName(initialName)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label htmlFor="display_name" className="text-sm font-medium">Business Display Name</label>
                <Input
                    id="display_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Distribution"
                    className="max-w-md"
                />
                <p className="text-sm text-slate-500">
                    This is the name vendors will see when they look for your business or view your catalog.
                    If left blank, it will fall back to your email address.
                </p>
            </div>

            <Button onClick={handleSave} disabled={isLoading || name === initialName}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
            </Button>
        </div>
    )
}
