'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { connectDistributor } from '../../actions'
import { resolveDistributor } from '@/app/onboarding/actions'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { CopyButton } from '@/components/ui/copy-button'

export default function ConnectDistributorPage() {
    const [code, setCode] = useState('')
    const [useUuid, setUseUuid] = useState(false)
    const [resolvedDistributor, setResolvedDistributor] = useState<any>(null)
    const [isResolving, setIsResolving] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const router = useRouter()

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

    async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (!resolvedDistributor) return

        setIsConnecting(true)
        try {
            const formData = new FormData()
            // We can send either code or UUID, action supports both. Safest to send UUID of validated dist.
            formData.append('code', resolvedDistributor.id)

            const result = await connectDistributor(formData)
            if (result.success) {
                toast.success(result.message || "Connected successfully")
                router.push('/vendor')
                router.refresh()
            } else {
                toast.error(result.message || "Failed to connect")
                setIsConnecting(false) // Only stop loading on fail so we don't flash before nav
            }
        } catch (error: any) {
            toast.error(error.message || "Something went wrong")
            setIsConnecting(false)
        }
    }

    return (
        <div className="flex justify-center items-start pt-12 min-h-[60vh]">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Connect to a Distributor</CardTitle>
                    <CardDescription>
                        Enter the unique code provided by your distributor to access their catalog.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleConnect} className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium">Distributor Code</label>
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
                                <div className="space-y-4">
                                    <div className="flex gap-2">
                                        <Input
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder={useUuid ? "Enter Distributor UUID" : "e.g. DIST-... "}
                                            className="font-mono bg-white uppercase"
                                        />
                                        <Button type="button" onClick={handleResolve} disabled={isResolving || !code}>
                                            {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-4 rounded-md border border-slate-200 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-900">{resolvedDistributor.name}</span>
                                            <button type="button" onClick={() => setResolvedDistributor(null)} className="text-xs text-red-600 hover:underline">Change</button>
                                        </div>

                                        <div className="grid gap-2 text-xs font-mono text-slate-600 bg-white p-3 rounded border border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500 font-semibold">CODE:</span>
                                                <span>{resolvedDistributor.code || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500 font-semibold">UUID:</span>
                                                <span className="truncate max-w-[140px]" title={resolvedDistributor.id}>{resolvedDistributor.id}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isConnecting}>
                                        {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Confirm Connection
                                    </Button>
                                </div>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
