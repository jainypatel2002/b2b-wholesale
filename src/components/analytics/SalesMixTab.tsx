
'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CategorySalesMix, ItemSalesMix } from '@/lib/analytics/salesMix'
import { formatMoney } from '@/lib/analytics/calc'

interface SalesMixTabProps {
    categories: CategorySalesMix[]
    items: (ItemSalesMix & { categoryId: string | null })[]
}

// Simple SVG Donut Chart Component
function DonutChart({
    data,
    centerLabel,
    centerSubLabel
}: {
    data: { label: string; value: number; color: string; percentage: number }[]
    centerLabel: string
    centerSubLabel: string
}) {
    const size = 200
    const strokeWidth = 40
    const radius = (size - strokeWidth) / 2
    const center = size / 2
    const circumference = 2 * Math.PI * radius

    let cumulativePercent = 0

    const slices = data.map((slice, i) => {
        const percent = slice.percentage / 100
        const dashArray = `${percent * circumference} ${circumference}`
        const rotate = cumulativePercent * 360
        cumulativePercent += percent

        return (
            <circle
                key={i}
                r={radius}
                cx={center}
                cy={center}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                transform={`rotate(${rotate - 90} ${center} ${center})`}
                className="transition-all duration-300 hover:opacity-80 cursor-pointer"
            >
                <title>{`${slice.label}: ${formatMoney(slice.value)} (${slice.percentage.toFixed(1)}%)`}</title>
            </circle>
        )
    })

    return (
        <div className="flex flex-col items-center">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {data.length > 0 ? slices : (
                        <circle
                            r={radius}
                            cx={center}
                            cy={center}
                            fill="transparent"
                            stroke="#e2e8f0"
                            strokeWidth={strokeWidth}
                        />
                    )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-sm font-medium text-slate-500">{centerSubLabel}</span>
                    <span className="text-lg font-bold text-slate-900">{centerLabel}</span>
                </div>
            </div>

            {/* Legend */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 w-full max-w-md">
                {data.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 truncate">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="truncate max-w-[120px]" title={item.label}>{item.label}</span>
                        </div>
                        <div className="flex gap-2 text-slate-600 font-mono text-xs">
                            <span>{item.percentage.toFixed(1)}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Vibrant colors for charts
const COLORS = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
    '#84cc16', // Lime
    '#f97316', // Orange
]

export function SalesMixTab({ categories, items }: SalesMixTabProps) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')

    const totalRevenue = categories.reduce((sum, c) => sum + c.revenue, 0)

    // Sort logic handled in backend, just taking top 10 for chart
    const categoryData = categories.slice(0, 10).map((c, i) => ({
        label: c.categoryName,
        value: c.revenue,
        color: COLORS[i % COLORS.length],
        percentage: c.percentage
    }))

    // Add 'Other' if more than 10
    if (categories.length > 10) {
        const otherRev = categories.slice(10).reduce((sum, c) => sum + c.revenue, 0)
        if (otherRev > 0) {
            categoryData.push({
                label: 'Others',
                value: otherRev,
                color: '#94a3b8',
                percentage: (otherRev / totalRevenue) * 100
            })
        }
    }

    // Filter Items based on selection
    const filteredItems = useMemo(() => {
        let filtered = items
        if (selectedCategoryId !== 'all') {
            const isUncategorized = selectedCategoryId === 'uncategorized'
            filtered = items.filter(i =>
                isUncategorized ? i.categoryId === null : i.categoryId === selectedCategoryId
            )
        }
        return filtered.sort((a, b) => b.revenue - a.revenue)
    }, [items, selectedCategoryId])

    const totalFilteredRevenue = filteredItems.reduce((sum, i) => sum + i.revenue, 0)

    const itemData = filteredItems.slice(0, 10).map((i, idx) => ({
        label: i.productName,
        value: i.revenue,
        color: COLORS[idx % COLORS.length],
        percentage: totalFilteredRevenue > 0 ? (i.revenue / totalFilteredRevenue) * 100 : 0
    }))

    if (filteredItems.length > 10) {
        const otherRev = filteredItems.slice(10).reduce((sum, i) => sum + i.revenue, 0)
        if (otherRev > 0) {
            itemData.push({
                label: 'Others',
                value: otherRev,
                color: '#94a3b8',
                percentage: (otherRev / totalFilteredRevenue) * 100
            })
        }
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Category Sales Share */}
            <Card>
                <CardHeader>
                    <CardTitle>Category Sales Share</CardTitle>
                    <CardDescription>Revenue distribution by category</CardDescription>
                </CardHeader>
                <CardContent>
                    {totalRevenue > 0 ? (
                        <DonutChart
                            data={categoryData}
                            centerLabel={formatMoney(totalRevenue)}
                            centerSubLabel="Total Sales"
                        />
                    ) : (
                        <div className="flex h-[200px] items-center justify-center text-slate-400">
                            No sales data
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Item Sales Share */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="space-y-1">
                        <CardTitle>Item Sales Share</CardTitle>
                        <CardDescription>Top products in selected category</CardDescription>
                    </div>
                    <select
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className="h-10 w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="all">All Categories</option>
                        {categories.map(c => (
                            <option key={c.categoryId || 'uncategorized'} value={c.categoryId || 'uncategorized'}>
                                {c.categoryName}
                            </option>
                        ))}
                    </select>
                </CardHeader>
                <CardContent>
                    {totalFilteredRevenue > 0 ? (
                        <DonutChart
                            data={itemData}
                            centerLabel={formatMoney(totalFilteredRevenue)}
                            centerSubLabel="Category Sales"
                        />
                    ) : (
                        <div className="flex h-[200px] items-center justify-center text-slate-400">
                            No sales data in range
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
