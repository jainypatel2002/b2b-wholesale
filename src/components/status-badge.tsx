export function StatusBadge({ status, type = 'default' }: { status: string, type?: 'default' | 'payment' }) {
    const styles: Record<string, string> = {
        placed: 'border-sky-200 bg-sky-50 text-sky-700',
        pending: 'border-slate-200 bg-slate-100 text-slate-700',
        accepted: 'border-amber-200 bg-amber-50 text-amber-700',
        fulfilled: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
        unpaid: 'border-rose-200 bg-rose-50 text-rose-700',
        paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }

    const normalized = status.toLowerCase()
    const className = styles[normalized] || (type === 'payment'
        ? 'border-slate-200 bg-slate-100 text-slate-700'
        : 'border-slate-200 bg-slate-100 text-slate-700')

    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${className}`}>
            {status}
        </span>
    )
}
