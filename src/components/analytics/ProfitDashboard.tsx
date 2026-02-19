
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProfitDateRangePicker, DateRange } from "@/components/analytics/DateRangePicker"
import { OverviewTab } from "@/components/analytics/OverviewTab"
import { ProductProfitabilityTab } from "@/components/analytics/ProductProfitabilityTab"
import { VendorProfitabilityTab } from "@/components/analytics/VendorProfitabilityTab"
import { TimePeriodReportsTab } from "@/components/analytics/TimePeriodReportsTab"
import { HiddenLossDetectorTab } from "@/components/analytics/HiddenLossDetectorTab"
import {
    ProfitOverview,
    ProductProfitability,
    VendorProfitability,
    TimeSeriesPoint,
    LossSignal
} from "@/lib/analytics/profit"
import { CategorySalesMix, ItemSalesMix } from '@/lib/analytics/salesMix'
import { SalesMixTab } from '@/components/analytics/SalesMixTab'
import { cn } from '@/lib/utils'

interface DashboardProps {
    overviewArg: ProfitOverview
    productsArg: ProductProfitability[]
    vendorsArg: VendorProfitability[]
    timeSeriesArg: TimeSeriesPoint[]
    signalsArg: LossSignal[]
    dateRangeArg: DateRange
    salesMixCategoriesArg: CategorySalesMix[]
    salesMixItemsArg: (ItemSalesMix & { categoryId: string | null })[]
}

export function ProfitDashboard({
    overviewArg,
    productsArg,
    vendorsArg,
    timeSeriesArg,
    signalsArg,
    dateRangeArg,
    salesMixCategoriesArg,
    salesMixItemsArg
}: DashboardProps) {
    const router = useRouter()
    const [dateRange, setDateRange] = useState<DateRange>(dateRangeArg)
    const [activeTab, setActiveTab] = useState('overview')

    const handleRangeChange = (newRange: DateRange) => {
        setDateRange(newRange)
        const params = new URLSearchParams()
        params.set('from', newRange.from.toISOString())
        params.set('to', newRange.to.toISOString())
        // Keep URL clean
        router.push(`?${params.toString()}`)
    }

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'mix', label: 'Sales Mix' },
        { id: 'products', label: 'Product Profitability' },
        { id: 'vendors', label: 'Vendor Profitability' },
        { id: 'time', label: 'Time Reports' },
        { id: 'loss', label: 'Hidden Loss Detector', badge: signalsArg.length > 0 }
    ]

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Profit Center</h1>
                <div className="flex items-center gap-2">
                    <ProfitDateRangePicker range={dateRange} onRangeChange={handleRangeChange} />
                </div>
            </div>

            <div className="space-y-4">
                {/* Custom Tabs List */}
                <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                                activeTab === tab.id
                                    ? "bg-white text-slate-950 shadow-sm"
                                    : "hover:bg-slate-200/50 hover:text-slate-900"
                            )}
                        >
                            {tab.label}
                            {tab.badge && <span className="ml-2 flex h-2 w-2 rounded-full bg-red-600" />}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="min-h-[400px]">
                    {activeTab === 'overview' && <OverviewTab data={overviewArg} />}
                    {activeTab === 'mix' && <SalesMixTab categories={salesMixCategoriesArg} items={salesMixItemsArg} />}
                    {activeTab === 'products' && <ProductProfitabilityTab data={productsArg} />}
                    {activeTab === 'vendors' && <VendorProfitabilityTab data={vendorsArg} />}
                    {activeTab === 'time' && <TimePeriodReportsTab data={timeSeriesArg} />}
                    {activeTab === 'loss' && <HiddenLossDetectorTab data={signalsArg} />}
                </div>
            </div>
        </div>
    )
}
