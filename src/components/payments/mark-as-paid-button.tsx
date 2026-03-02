'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markInvoiceAsPaidAction, markOrderAsPaidAction } from '@/app/actions/distributor'

type MarkAsPaidTarget = 'order' | 'invoice'

interface MarkAsPaidButtonProps {
    target: MarkAsPaidTarget
    id: string
    alreadyPaid?: boolean
    size?: 'sm' | 'default' | 'lg' | 'icon'
    variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
    className?: string
    fullWidth?: boolean
    label?: string
}

export function MarkAsPaidButton({
    target,
    id,
    alreadyPaid = false,
    size = 'sm',
    variant = 'default',
    className,
    fullWidth = false,
    label,
}: MarkAsPaidButtonProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    const noun = target === 'order' ? 'order' : 'invoice'
    const buttonLabel = label || (alreadyPaid ? 'Paid' : 'Mark as Paid')

    const handleClick = async () => {
        if (!id) {
            toast.error(`Missing ${noun} id.`)
            return
        }

        const confirmed = window.confirm(`This will mark the ${noun} as fully paid. Continue?`)
        if (!confirmed) return

        setIsLoading(true)
        try {
            const result = target === 'order'
                ? await markOrderAsPaidAction(id)
                : await markInvoiceAsPaidAction(id)

            if (!result.success) {
                toast.error(result.error || `Failed to mark ${noun} as paid.`)
                return
            }

            toast.success(result.alreadyPaid ? 'Already marked as paid' : 'Marked as paid')
            router.refresh()
        } catch (error) {
            console.error(`Failed to mark ${noun} as paid`, error)
            toast.error('Unable to complete this action right now. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Button
            type="button"
            size={size}
            variant={variant}
            className={`${fullWidth ? 'w-full' : ''} ${className || ''}`.trim()}
            onClick={handleClick}
            disabled={isLoading || alreadyPaid}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonLabel}
        </Button>
    )
}
