'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type InsightCategory = {
    category_name: string
    spend: number
    quantity: number
}

type InsightWindow = {
    window_days: number
    total_spent: number
    avg_order_value: number
    orders_count: number
    order_frequency_per_week: number
    order_frequency_per_month: number
    top_categories: InsightCategory[]
}

type MarginCategory = {
    category_name: string
    revenue: number
    cost: number
    margin: number
    margin_percent: number
}

type InsightsPayload = {
    ok: boolean
    can_view_margin: boolean
    insights: {
        '30': InsightWindow
        '90': InsightWindow
    }
    margin_by_category: {
        '30': MarginCategory[]
        '90': MarginCategory[]
    }
}

function formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0)
}

function formatRate(value: number): string {
    return `${(value || 0).toFixed(2)}`
}

export function VendorInsightsPanel({ distributorId }: { distributorId: string | null }) {
    const [loading, setLoading] = useState(Boolean(distributorId))
    const [error, setError] = useState<string | null>(null)
    const [range, setRange] = useState<'30' | '90'>('30')
    const [data, setData] = useState<InsightsPayload | null>(null)

    useEffect(() => {
        if (!distributorId) {
            setLoading(false)
            setData(null)
            return
        }

        let cancelled = false
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await fetch(`/api/vendor/insights?distributorId=${encodeURIComponent(distributorId)}`, {
                    method: 'GET',
                    cache: 'no-store'
                })
                const payload = await response.json().catch(() => ({}))
                if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to load insights')
                }
                if (!cancelled) setData(payload as InsightsPayload)
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'Failed to load insights')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [distributorId])

    const activeWindow = useMemo(() => data?.insights?.[range], [data, range])
    const activeMarginRows = useMemo(() => data?.margin_by_category?.[range] ?? [], [data, range])

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">Purchase Insights</CardTitle>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    <Button
                        size="sm"
                        variant={range === '30' ? 'secondary' : 'ghost'}
                        onClick={() => setRange('30')}
                    >
                        30d
                    </Button>
                    <Button
                        size="sm"
                        variant={range === '90' ? 'secondary' : 'ghost'}
                        onClick={() => setRange('90')}
                    >
                        90d
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {!distributorId && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        Connect or select a distributor to view purchase insights.
                    </div>
                )}

                {loading && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
                        ))}
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {!loading && !error && activeWindow && (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Spent</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(activeWindow.total_spent)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Avg Order Value</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(activeWindow.avg_order_value)}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Orders</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900">{activeWindow.orders_count}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Frequency</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {formatRate(activeWindow.order_frequency_per_week)}/week
                                </p>
                                <p className="text-xs text-slate-500">
                                    {formatRate(activeWindow.order_frequency_per_month)}/month
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Top Categories</p>
                            {activeWindow.top_categories.length === 0 ? (
                                <p className="mt-2 text-sm text-slate-500">No category purchases recorded in this range.</p>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    {activeWindow.top_categories.map((cat) => (
                                        <div key={cat.category_name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                                            <div>
                                                <p className="text-sm font-medium text-slate-900">{cat.category_name}</p>
                                                <p className="text-xs text-slate-500">{cat.quantity.toFixed(2)} qty</p>
                                            </div>
                                            <p className="text-sm font-semibold text-slate-900">{formatMoney(cat.spend)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {data?.can_view_margin && (
                            <div className="rounded-lg border border-slate-200 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Margin by Category</p>
                                {activeMarginRows.length === 0 ? (
                                    <p className="mt-2 text-sm text-slate-500">No margin rows in this range.</p>
                                ) : (
                                    <div className="mt-2 space-y-2">
                                        {activeMarginRows.map((row) => (
                                            <div key={row.category_name} className="rounded-md bg-slate-50 px-3 py-2">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium text-slate-900">{row.category_name}</p>
                                                    <p className="text-sm font-semibold text-slate-900">{row.margin_percent.toFixed(2)}%</p>
                                                </div>
                                                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                                                    <span>Revenue {formatMoney(row.revenue)}</span>
                                                    <span>Cost {formatMoney(row.cost)}</span>
                                                    <span>Margin {formatMoney(row.margin)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {!data?.can_view_margin && (
                            <p className="text-xs text-slate-500">
                                Margin insights are disabled for this distributor.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
