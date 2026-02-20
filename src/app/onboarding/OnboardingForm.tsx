'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { resolveDistributor } from './actions'
import { CopyButton } from '@/components/ui/copy-button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface OnboardingFormProps {
    submitAction: (formData: FormData) => Promise<void>
}

export function OnboardingForm({ submitAction }: OnboardingFormProps) {
    const [role, setRole] = useState('distributor')
    const [code, setCode] = useState('')
    const [useUuid, setUseUuid] = useState(false)
    const [resolvedDistributor, setResolvedDistributor] = useState<any>(null)
    const [isResolving, setIsResolving] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleResolve() {
        if (!code.trim()) {
            toast.error("Please enter a distributor code or UUID")
            return
        }

        setIsResolving(true)
        setResolvedDistributor(null)
        try {
            const res = await resolveDistributor(code.trim())
            if (res.success) {
                setResolvedDistributor(res.distributor)
            } else {
                toast.error(res.message)
            }
        } catch (e) {
            toast.error("Failed to resolve distributor")
        } finally {
            setIsResolving(false)
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (role === 'vendor' && !resolvedDistributor) {
            toast.error("Please resolve a distributor first")
            return
        }

        setIsSubmitting(true)
        try {
            const formData = new FormData(e.currentTarget)
            if (role === 'vendor') {
                // Must pass the resolved UUID to the backend for linking
                formData.set('distributor_id', resolvedDistributor.id)
            }
            await submitAction(formData)
        } catch (err: any) {
            toast.error(err.message || "Something went wrong")
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <div className="space-y-2">
                <label className="text-sm font-medium">Display Name (optional)</label>
                <Input name="display_name" placeholder="Ex: Jainy Wholesale" />
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <select
                    name="role"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={role}
                    onChange={(e) => {
                        setRole(e.target.value)
                        setResolvedDistributor(null)
                    }}
                >
                    <option value="distributor">Distributor</option>
                    <option value="vendor">Vendor</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">If you pick Vendor, you must link to a distributor below.</p>
            </div>

            {role === 'vendor' && (
                <div className="space-y-4 rounded-lg border border-slate-200 p-4 bg-slate-50">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium">Link to Distributor</label>
                        <button
                            type="button"
                            onClick={() => {
                                setUseUuid(!useUuid)
                                setResolvedDistributor(null)
                                setCode('')
                            }}
                            className="text-xs text-blue-600 hover:underline"
                        >
                            {useUuid ? "Use Unique Code instead" : "Use UUID instead (advanced)"}
                        </button>
                    </div>

                    {!resolvedDistributor ? (
                        <div className="flex gap-2">
                            <Input
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder={useUuid ? "Enter Distributor UUID" : "Enter Unique Code (e.g. DIST-...)"}
                                className="font-mono bg-white"
                            />
                            <Button type="button" onClick={handleResolve} disabled={isResolving || !code}>
                                {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3 bg-white p-3 rounded-md border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-900">{resolvedDistributor.name}</span>
                                <button type="button" onClick={() => setResolvedDistributor(null)} className="text-xs text-red-600 hover:underline">Change</button>
                            </div>

                            <div className="grid gap-2 text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">CODE:</span>
                                    <span>{resolvedDistributor.code || 'N/A'}</span>
                                    {resolvedDistributor.code && <CopyButton text={resolvedDistributor.code} variant="ghost" className="h-6 w-6 p-0" label="" />}
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">UUID:</span>
                                    <span className="truncate max-w-[140px]" title={resolvedDistributor.id}>{resolvedDistributor.id}</span>
                                    <CopyButton text={resolvedDistributor.id} variant="ghost" className="h-6 w-6 p-0" label="" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting || (role === 'vendor' && !resolvedDistributor)}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
            </Button>
        </form>
    )
}
