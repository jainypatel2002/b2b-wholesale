
'use client'

import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export type DateRange = { from: Date; to: Date }

interface DateRangeProps {
    range: DateRange
    onRangeChange: (range: DateRange) => void
    className?: string
    showPresets?: boolean
}

export function ProfitDateRangePicker({
    range,
    onRangeChange,
    className,
    showPresets = true
}: DateRangeProps) {

    const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.valueAsDate
        if (val) {
            // preserve current 'to', ensure from <= to
            const newFrom = val
            let newTo = range.to
            if (newFrom > newTo) newTo = newFrom
            onRangeChange({ from: newFrom, to: newTo })
        }
    }

    const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.valueAsDate
        if (val) {
            const newTo = val
            let newFrom = range.from
            if (newTo < newFrom) newFrom = newTo
            onRangeChange({ from: newFrom, to: newTo })
        }
    }

    const setPreset = (days: number) => {
        const to = new Date()
        const from = new Date()
        from.setDate(to.getDate() - days)
        onRangeChange({ from, to })
    }

    return (
        <div className={cn("rounded-md border bg-white p-2", className)}>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                <label className="space-y-1">
                    <span className="block text-xs font-medium text-slate-600">From</span>
                    <input
                        type="date"
                        className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                        value={format(range.from, 'yyyy-MM-dd')}
                        onChange={handleFromChange}
                    />
                </label>
                <span className="hidden pb-3 text-muted-foreground sm:block">-</span>
                <label className="space-y-1">
                    <span className="block text-xs font-medium text-slate-600">To</span>
                    <input
                        type="date"
                        className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                        value={format(range.to, 'yyyy-MM-dd')}
                        onChange={handleToChange}
                    />
                </label>
            </div>
            {showPresets && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setPreset(7)} className="h-11 w-full text-xs sm:h-9 sm:w-auto">
                        Last 7d
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPreset(30)} className="h-11 w-full text-xs sm:h-9 sm:w-auto">
                        Last 30d
                    </Button>
                </div>
            )}
        </div>
    )
}
