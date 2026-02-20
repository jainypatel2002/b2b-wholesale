'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Copy, Share2, Check, RefreshCw, AlertTriangle } from "lucide-react"
import { toast } from 'sonner'
import { ensureAndGetCode } from '@/app/(protected)/distributor/actions'

interface ShareCodeCardProps {
    initialCode: string | null
    className?: string
}

export function ShareCodeCard({ initialCode, className }: ShareCodeCardProps) {
    const [code, setCode] = useState<string | null>(initialCode)
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        if (!code) return
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            toast.success("Code copied to clipboard")
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            toast.error("Failed to copy code")
        }
    }

    async function handleShare() {
        if (!code) return
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Join my Distributor Portal',
                    text: `Use my distributor code to connect: ${code}`,
                })
            } catch (err) {
                // Ignore abort errors
            }
        } else {
            handleCopy()
        }
    }

    // Auto-generate if missing
    async function ensureCode() {
        if (code) return
        setLoading(true)
        try {
            const newCode = await ensureAndGetCode()
            setCode(newCode)
        } catch (err) {
            toast.error("Failed to generate code")
        } finally {
            setLoading(false)
        }
    }

    // Trigger generation on mount if missing (optional, or just use button)
    // Let's hide the code view if missing and show a "Generate" button, or just auto-call.
    // For better UX, let's auto-call if it's missing.
    useState(() => {
        if (!initialCode) ensureCode()
    })

    return (
        <Card className={className}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium text-slate-500">Your Distributor Code</CardTitle>
                <CardDescription>Share this code with vendors to let them connect to you.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center gap-2 text-slate-400 py-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Generating code...</span>
                    </div>
                ) : code ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <div className="flex w-full items-center justify-center rounded-md border border-slate-200 bg-slate-50 py-3 font-mono text-xl font-bold tracking-wider text-slate-900 shadow-sm">
                                    {code}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={handleCopy}
                            >
                                {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
                                {copied ? "Copied" : "Copy Code"}
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={handleShare}
                            >
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 py-2">
                        <div className="text-sm text-red-500 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            <span>Code missing</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={ensureCode} disabled={loading}>
                            Retry Generation
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
