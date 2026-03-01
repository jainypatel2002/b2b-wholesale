import React from 'react'

export function formatCurrencySafe(amount: unknown): string {
    const n = typeof amount === 'number' ? amount : Number(amount)
    const safeAmount = Number.isFinite(n) ? n : 0
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(safeAmount)
}

interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
    amount: unknown
    fallback?: string
}

export function Money({ amount, fallback = '$0.00', className = '', ...props }: MoneyProps) {
    const n = typeof amount === 'number' ? amount : Number(amount)
    const isValid = Number.isFinite(n)

    const formatted = isValid
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
        : fallback

    return (
        <span
            className={`truncate tabular-nums ${className}`}
            title={formatted}
            {...props}
        >
            {formatted}
        </span>
    )
}
