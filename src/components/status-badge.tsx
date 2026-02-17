export function StatusBadge({ status, type = 'default' }: { status: string, type?: 'default' | 'payment' }) {
    const styles: Record<string, string> = {
        // Order Statuses
        placed: 'bg-blue-100 text-blue-700',
        accepted: 'bg-yellow-100 text-yellow-700',
        fulfilled: 'bg-green-100 text-green-700',
        cancelled: 'bg-gray-100 text-gray-700',

        // Payment Statuses
        unpaid: 'bg-red-100 text-red-700',
        paid: 'bg-green-100 text-green-700',
    }

    const normalized = status.toLowerCase()
    const className = styles[normalized] || 'bg-slate-100 text-slate-700'

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${className}`}>
            {status}
        </span>
    )
}
