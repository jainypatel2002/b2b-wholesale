
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
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
import { toast } from 'sonner'
import { AlertTriangle, Printer, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { ProfitCenterReport } from '@/components/analytics/ProfitCenterReport'

interface DashboardProps {
    overviewArg: ProfitOverview
    productsArg: ProductProfitability[]
    vendorsArg: VendorProfitability[]
    timeSeriesArg: TimeSeriesPoint[]
    signalsArg: LossSignal[]
    dateRangeArg: DateRange
    salesMixCategoriesArg: CategorySalesMix[]
    salesMixItemsArg: (ItemSalesMix & { categoryId: string | null })[]
    distributorNameArg: string
    distributorEmailArg: string
    lastResetAtArg: string | null
    selectedRangeBeforeResetArg: boolean
}

export function ProfitDashboard({
    overviewArg,
    productsArg,
    vendorsArg,
    timeSeriesArg,
    signalsArg,
    dateRangeArg,
    salesMixCategoriesArg,
    salesMixItemsArg,
    distributorNameArg,
    distributorEmailArg,
    lastResetAtArg,
    selectedRangeBeforeResetArg
}: DashboardProps) {
    const router = useRouter()
    const [dateRange, setDateRange] = useState<DateRange>(dateRangeArg)
    const [activeTab, setActiveTab] = useState('overview')
    const [showMobileFilters, setShowMobileFilters] = useState(false)
    const [showResetModal, setShowResetModal] = useState(false)
    const [resetConfirmation, setResetConfirmation] = useState('')
    const [isResetting, setIsResetting] = useState(false)
    const [generatedAt, setGeneratedAt] = useState<Date>(new Date())
    const [reportMode, setReportMode] = useState(false)
    const [isPreparingReport, setIsPreparingReport] = useState(false)
    const [reportErrors, setReportErrors] = useState<string[]>([])

    const lastResetDate = useMemo(() => {
        if (!lastResetAtArg) return null
        const parsed = new Date(lastResetAtArg)
        return Number.isNaN(parsed.getTime()) ? null : parsed
    }, [lastResetAtArg])

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'mix', label: 'Sales Mix' },
        { id: 'products', label: 'Product Profitability' },
        { id: 'vendors', label: 'Vendor Profitability' },
        { id: 'time', label: 'Time Reports' },
        { id: 'loss', label: 'Hidden Loss Detector', badge: signalsArg.length > 0 }
    ]

    const formatDateTimeLabel = (value: Date) => format(value, "MMM d, yyyy 'at' h:mm a")
    const canConfirmReset = resetConfirmation.trim().toUpperCase() === 'RESET' && !isResetting
    const reportSections = useMemo(
        () => [
            { label: 'Overview', ready: Boolean(overviewArg) },
            { label: 'Sales Mix', ready: Array.isArray(salesMixCategoriesArg) && Array.isArray(salesMixItemsArg) },
            { label: 'Product Profitability', ready: Array.isArray(productsArg) },
            { label: 'Vendor Profitability', ready: Array.isArray(vendorsArg) },
            { label: 'Time Reports', ready: Array.isArray(timeSeriesArg) },
            { label: 'Hidden Loss Detector', ready: Array.isArray(signalsArg) }
        ],
        [overviewArg, productsArg, salesMixCategoriesArg, salesMixItemsArg, signalsArg, timeSeriesArg, vendorsArg]
    )
    const loadedReportSections = reportSections.filter((section) => section.ready).length
    const failedReportSections = reportSections
        .filter((section) => !section.ready)
        .map((section) => section.label)

    useEffect(() => {
        const handleAfterPrint = () => {
            setReportMode(false)
            setIsPreparingReport(false)
        }

        window.addEventListener('afterprint', handleAfterPrint)
        return () => window.removeEventListener('afterprint', handleAfterPrint)
    }, [])

    const handleRangeChange = (newRange: DateRange) => {
        setDateRange(newRange)
        const params = new URLSearchParams()
        params.set('from', newRange.from.toISOString())
        params.set('to', newRange.to.toISOString())
        setShowMobileFilters(false)
        // Keep URL clean
        router.push(`?${params.toString()}`)
    }

    const prepareReportForPrint = useCallback(async () => {
        setGeneratedAt(new Date())
        setReportErrors([])
        setIsPreparingReport(true)

        if (failedReportSections.length > 0) {
            setReportErrors(failedReportSections)
            setIsPreparingReport(false)
            return false
        }

        setReportMode(true)

        await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
                window.setTimeout(resolve, 100)
            })
        })

        return true
    }, [failedReportSections])

    const handlePrint = useCallback(async () => {
        if (isPreparingReport) return

        const isReady = await prepareReportForPrint()
        if (!isReady) {
            toast.error('Some report sections failed to load. Please retry.')
            return
        }

        try {
            window.print()
        } catch {
            setReportMode(false)
            setIsPreparingReport(false)
            toast.error('Unable to open the print dialog.')
        }
    }, [isPreparingReport, prepareReportForPrint])

    const openResetModal = () => {
        setResetConfirmation('')
        setShowResetModal(true)
    }

    const closeResetModal = () => {
        if (isResetting) return
        setShowResetModal(false)
        setResetConfirmation('')
    }

    const handleReset = async () => {
        if (!canConfirmReset) return

        try {
            setIsResetting(true)
            const response = await fetch('/api/distributor/profit/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: format(dateRange.from, 'yyyy-MM-dd'),
                    to: format(dateRange.to, 'yyyy-MM-dd')
                })
            })

            const payload = await response.json().catch(() => null)

            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to reset profit center analytics.')
            }

            toast.success('Profit Center analytics reset. New orders will accumulate from now.')
            setShowResetModal(false)
            setResetConfirmation('')
            router.refresh()
        } catch (error: any) {
            toast.error(error?.message || 'Failed to reset profit center analytics.')
        } finally {
            setIsResetting(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {reportMode && (
                <div id="profit-center-report" className="hidden print:block">
                    <ProfitCenterReport
                        overview={overviewArg}
                        products={productsArg}
                        vendors={vendorsArg}
                        timeSeries={timeSeriesArg}
                        signals={signalsArg}
                        dateRange={dateRange}
                        salesMixCategories={salesMixCategoriesArg}
                        salesMixItems={salesMixItemsArg}
                        distributorName={distributorNameArg}
                        distributorEmail={distributorEmailArg}
                        generatedAt={generatedAt}
                        lastResetAt={lastResetAtArg}
                        selectedRangeBeforeReset={selectedRangeBeforeResetArg}
                    />
                </div>
            )}

            <div id="profit-center-screen" className="profit-center-screen space-y-6">
                {/* Mobile fix: title/date controls previously overflowed; stack and collapse filters on small screens. */}
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profit Center</h1>
                            <p className="mt-1 text-xs text-slate-600">
                                Since last reset:{' '}
                                {lastResetDate ? formatDateTimeLabel(lastResetDate) : 'Not reset yet'}
                            </p>
                            {selectedRangeBeforeResetArg && (
                                <p className="mt-1 text-xs font-medium text-amber-700">
                                    Selected range is before last reset. Metrics are zero for this range.
                                </p>
                            )}
                        </div>

                        <div className="no-print hidden md:flex md:items-start md:gap-2">
                            <ProfitDateRangePicker range={dateRange} onRangeChange={handleRangeChange} className="p-1" />
                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handlePrint}
                                    disabled={isPreparingReport}
                                    className="h-11 justify-center gap-2 whitespace-nowrap"
                                >
                                    <Printer className="h-4 w-4" />
                                    {isPreparingReport ? 'Preparing report...' : 'Print / Save PDF'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={openResetModal}
                                    className="h-11 justify-center gap-2 whitespace-nowrap"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Reset Profit Center
                                </Button>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowMobileFilters((current) => !current)}
                            className="no-print h-11 w-full justify-center gap-2 md:hidden"
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
                            "no-print overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all duration-200 md:hidden",
                            showMobileFilters ? "max-h-[480px] p-3 opacity-100" : "max-h-0 p-0 opacity-0"
                        )}
                    >
                        <ProfitDateRangePicker
                            range={dateRange}
                            onRangeChange={handleRangeChange}
                            className="border-0 bg-transparent p-0"
                        />
                        <div className="mt-3 grid gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePrint}
                                disabled={isPreparingReport}
                                className="h-11 justify-center gap-2"
                            >
                                <Printer className="h-4 w-4" />
                                {isPreparingReport ? 'Preparing report...' : 'Print / Save PDF'}
                            </Button>
                            <Button type="button" variant="destructive" onClick={openResetModal} className="h-11 justify-center gap-2">
                                <RotateCcw className="h-4 w-4" />
                                Reset Profit Center
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Mobile fix: tabs previously overflowed viewport; keep horizontal scroll only inside the tabs rail. */}
                    <div className="no-print rounded-md border border-slate-200/80 bg-slate-100 p-1 text-slate-500">
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

            {showResetModal && (
                <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-semibold text-slate-900">Reset Profit Center analytics?</h3>
                                <p className="text-sm text-slate-600">
                                    This does not delete orders, invoices, products, or financial records. It only resets
                                    Profit Center analytics to start from now.
                                </p>
                                <p className="text-xs text-slate-500">
                                    Last reset: {lastResetDate ? formatDateTimeLabel(lastResetDate) : 'Never'}
                                </p>
                                <p className="text-xs text-slate-500">Type <span className="font-semibold">RESET</span> to confirm.</p>
                            </div>
                        </div>

                        <input
                            value={resetConfirmation}
                            onChange={(event) => setResetConfirmation(event.target.value)}
                            placeholder="Type RESET"
                            className="mt-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                            autoFocus
                        />

                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={handlePrint} disabled={isPreparingReport}>
                                {isPreparingReport ? 'Preparing report...' : 'Print / Save PDF'}
                            </Button>
                            <Button type="button" variant="outline" onClick={closeResetModal} disabled={isResetting}>
                                Cancel
                            </Button>
                            <Button type="button" variant="destructive" onClick={handleReset} disabled={!canConfirmReset}>
                                {isResetting ? 'Resetting...' : 'Confirm Reset'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {(isPreparingReport || reportErrors.length > 0) && (
                <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-slate-900">
                            {reportErrors.length > 0 ? 'Report preparation failed' : 'Preparing report...'}
                        </h3>
                        {reportErrors.length > 0 ? (
                            <>
                                <p className="mt-2 text-sm text-slate-600">
                                    Some sections are unavailable right now. Retry once data is available.
                                </p>
                                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                                    {reportErrors.map((section) => (
                                        <li key={section}>{section}</li>
                                    ))}
                                </ul>
                                <div className="mt-4 flex justify-end gap-2">
                                    <Button type="button" variant="outline" onClick={() => setReportErrors([])}>
                                        Close
                                    </Button>
                                    <Button type="button" onClick={handlePrint}>
                                        Retry
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className="mt-2 text-sm text-slate-600">
                                Preparing report... ({loadedReportSections}/{reportSections.length} sections loaded)
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
