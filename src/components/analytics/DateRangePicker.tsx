
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

export type DateRange = { from: Date; to: Date }

interface DateRangeProps {
    range: DateRange
    onRangeChange: (range: DateRange) => void
}

export function ProfitDateRangePicker({ range, onRangeChange }: DateRangeProps) {

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
        <div className="flex items-center gap-2 bg-white border p-1 rounded-md">
            <input
                type="date"
                className="border-none text-sm focus:ring-0"
                value={format(range.from, 'yyyy-MM-dd')}
                onChange={handleFromChange}
            />
            <span className="text-muted-foreground">-</span>
            <input
                type="date"
                className="border-none text-sm focus:ring-0"
                value={format(range.to, 'yyyy-MM-dd')}
                onChange={handleToChange}
            />
            <div className="h-4 w-px bg-slate-200 mx-1" />
            <Button variant="ghost" size="sm" onClick={() => setPreset(7)} className="h-7 text-xs px-2">7d</Button>
            <Button variant="ghost" size="sm" onClick={() => setPreset(30)} className="h-7 text-xs px-2">30d</Button>
        </div>
    )
}
