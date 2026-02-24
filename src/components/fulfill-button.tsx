'use client'

import { useState } from 'react'
import { fulfillOrderAction } from '@/app/actions/distributor'

import { Button } from '@/components/ui/button'

export function FulfillButton({ orderId }: { orderId: string }) {
    const [loading, setLoading] = useState(false)

    async function handleFulfill() {
        if (!confirm('Are you sure you want to fulfill this order? Inventory will be deducted.')) return

        setLoading(true)
        try {
            const res = await fulfillOrderAction(orderId)
            if (res.error) {
                alert(`Error: ${res.error}`)
            } else {
                // Success - the server action revalidates, so the page will update.
            }
        } catch (e) {
            alert('An unexpected error occurred')
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button
            onClick={handleFulfill}
            disabled={loading}
            className="w-full"
        >
            {loading ? 'Processing...' : 'Fulfill Order'}
        </Button>
    )
}
