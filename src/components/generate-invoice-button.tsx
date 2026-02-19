'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createInvoiceAction } from '@/app/actions/distributor'
import { useRouter } from 'next/navigation'

export function GenerateInvoiceButton({ orderId }: { orderId: string }) {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const handleGenerate = () => {
        startTransition(async () => {
            try {
                const res = await createInvoiceAction(orderId)
                if (res.error) {
                    alert(`Failed to generate invoice: ${res.error}`)
                    return
                }
                if (res.success && res.invoiceId) {
                    // router.refresh() // Optional, but usually good to refresh data
                    router.push(`/distributor/invoices/${res.invoiceId}`)
                }
            } catch (e: any) {
                alert(`Unexpected error: ${e.message}`)
            }
        })
    }

    return (
        <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleGenerate}
            disabled={isPending}
        >
            {isPending ? 'Generating...' : 'Generate Invoice'}
        </Button>
    )
}
