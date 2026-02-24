
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
import { Button } from '@/components/ui/button'
import { SlidersHorizontal } from 'lucide-react'

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
    const [showMobileFilters, setShowMobileFilters] = useState(false)

    const handleRangeChange = (newRange: DateRange) => {
        setDateRange(newRange)
        const params = new URLSearchParams()
        params.set('from', newRange.from.toISOString())
        params.set('to', newRange.to.toISOString())
        setShowMobileFilters(false)
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
            {/* Mobile fix: title/date controls previously overflowed; stack and collapse filters on small screens. */}
            <div className="space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profit Center</h1>
                    <div className="hidden md:flex md:items-center md:gap-2">
                        <ProfitDateRangePicker range={dateRange} onRangeChange={handleRangeChange} className="p-1" />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowMobileFilters((current) => !current)}
                        className="h-11 w-full justify-center gap-2 md:hidden"
                        aria-expanded={showMobileFilters}
                        aria-controls="profit-center-mobile-filters"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        Filters
                    </Button>
                </div>
                <div
                    id="profit-center-mobile-filters"
                    className={cn(
                        "overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all duration-200 md:hidden",
                        showMobileFilters ? "max-h-[320px] p-3 opacity-100" : "max-h-0 p-0 opacity-0"
                    )}
                >
                    <ProfitDateRangePicker
                        range={dateRange}
                        onRangeChange={handleRangeChange}
                        className="border-0 bg-transparent p-0"
                    />
                </div>
            </div>

            <div className="space-y-4">
                {/* Mobile fix: tabs previously overflowed viewport; keep horizontal scroll only inside the tabs rail. */}
                <div className="rounded-md border border-slate-200/80 bg-slate-100 p-1 text-slate-500">
                    <div className="flex min-h-[44px] gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
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
                </div>

                {/* Content */}
                <div className="min-h-[400px] max-w-full overflow-x-hidden">
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
