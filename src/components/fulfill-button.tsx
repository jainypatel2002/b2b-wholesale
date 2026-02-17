'use client'

import { useState } from 'react'
import { fulfillOrderAction } from '@/app/actions/distributor'

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
                // We could also show a success message.
            }
        } catch (e) {
            alert('An unexpected error occurred')
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleFulfill}
            disabled={loading}
            className="btn bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
            {loading ? 'Processing...' : 'Fulfill Order'}
        </button>
    )
}
