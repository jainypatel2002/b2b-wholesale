'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
    text: string
    label?: string
    className?: string
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
}

export function CopyButton({ text, label = "Copy", className, variant = "outline" }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            toast.success("Copied to clipboard")
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            toast.error("Failed to copy")
        }
    }

    return (
        <Button
            type="button"
            variant={variant}
            className={cn("flex items-center justify-center transition-all", className)}
            onClick={handleCopy}
        >
            {copied ? (
                <Check className="mr-2 h-4 w-4 text-green-600" />
            ) : (
                <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : label}
        </Button>
    )
}
