'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { formatMoney, formatPercent } from '@/lib/analytics/calc'
import type {
    LossSignal,
    ProductProfitability,
    ProfitOverview,
    TimeSeriesPoint,
    VendorProfitability
} from '@/lib/analytics/profit'
import type { CategorySalesMix, ItemSalesMix } from '@/lib/analytics/salesMix'

interface ProfitCenterReportProps {
    overview: ProfitOverview
    products: ProductProfitability[]
    vendors: VendorProfitability[]
    timeSeries: TimeSeriesPoint[]
    signals: LossSignal[]
    dateRange: { from: Date; to: Date }
    salesMixCategories: CategorySalesMix[]
    salesMixItems: (ItemSalesMix & { categoryId: string | null })[]
    distributorName: string
    distributorEmail: string
    generatedAt: Date
    lastResetAt: string | null
    selectedRangeBeforeReset: boolean
}

function formatDateLabel(value: Date) {
    return format(value, 'MMM d, yyyy')
}

function formatDateTimeLabel(value: Date) {
    return format(value, "MMM d, yyyy 'at' h:mm a")
}

function formatSignalSeverity(value: LossSignal['severity']) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatSignalType(value: LossSignal['type']) {
    return value
}

export function ProfitCenterReport({
    overview,
    products,
    vendors,
    timeSeries,
    signals,
    dateRange,
    salesMixCategories,
    salesMixItems,
    distributorName,
    distributorEmail,
    generatedAt,
    lastResetAt,
    selectedRangeBeforeReset
}: ProfitCenterReportProps) {
    const topCategories = useMemo(() => salesMixCategories.slice(0, 10), [salesMixCategories])
    const categoryOverflow = Math.max(0, salesMixCategories.length - topCategories.length)

    const sortedItems = useMemo(
        () => [...salesMixItems].sort((a, b) => b.revenue - a.revenue),
        [salesMixItems]
    )
    const topItems = sortedItems.slice(0, 10)
    const itemOverflow = Math.max(0, sortedItems.length - topItems.length)
    const totalItemRevenue = sortedItems.reduce((sum, item) => sum + item.revenue, 0)

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local timezone'
    const resetDate = lastResetAt ? new Date(lastResetAt) : null
    const validResetDate = resetDate && !Number.isNaN(resetDate.getTime()) ? resetDate : null

    return (
        <div className="profit-report text-slate-900">
            <div className="profit-report-header">
                <h1 className="profit-report-title">Your Supply Bridge - Profit Center Report</h1>
                <div className="profit-report-meta-grid">
                    <p><span className="profit-report-meta-label">Distributor:</span> {distributorName || 'Distributor'}</p>
                    <p><span className="profit-report-meta-label">Email:</span> {distributorEmail || 'N/A'}</p>
                    <p>
                        <span className="profit-report-meta-label">Date range:</span>{' '}
                        {formatDateLabel(dateRange.from)} - {formatDateLabel(dateRange.to)}
                    </p>
                    <p><span className="profit-report-meta-label">Generated:</span> {formatDateTimeLabel(generatedAt)}</p>
                    <p>
                        <span className="profit-report-meta-label">Since last reset:</span>{' '}
                        {validResetDate ? formatDateTimeLabel(validResetDate) : 'Not reset yet'}
                    </p>
                    <p><span className="profit-report-meta-label">Timezone:</span> {timezone}</p>
                </div>
                {selectedRangeBeforeReset && (
                    <p className="profit-report-warning">
                        Selected range is before last reset. Metrics are zero for this range.
                    </p>
                )}
            </div>

            <section className="profit-report-section">
                <h2 className="profit-report-section-title">1. Overview</h2>
                <div className="profit-report-kpi-grid">
                    <div className="profit-report-kpi-card">
                        <p className="profit-report-kpi-label">Total Revenue</p>
                        <p className="profit-report-kpi-value">{formatMoney(overview.revenue)}</p>
                    </div>
                    <div className="profit-report-kpi-card">
                        <p className="profit-report-kpi-label">Cost of Goods</p>
                        <p className="profit-report-kpi-value">{formatMoney(overview.cost)}</p>
                    </div>
                    <div className="profit-report-kpi-card">
                        <p className="profit-report-kpi-label">Net Profit</p>
                        <p className="profit-report-kpi-value">{formatMoney(overview.profit)}</p>
                    </div>
                    <div className="profit-report-kpi-card">
                        <p className="profit-report-kpi-label">Avg Margin</p>
                        <p className="profit-report-kpi-value">{formatPercent(overview.margin)}</p>
                    </div>
                    <div className="profit-report-kpi-card">
                        <p className="profit-report-kpi-label">Orders Count</p>
                        <p className="profit-report-kpi-value">{overview.orderCount.toLocaleString('en-US')}</p>
                    </div>
                </div>
            </section>

            <section className="profit-report-section print-page-break">
                <h2 className="profit-report-section-title">2. Sales Mix</h2>
                <p className="profit-report-section-copy">Table fallback for print output (top 10 rows).</p>
                <div className="profit-report-grid-2">
                    <div>
                        <h3 className="profit-report-subtitle">Category Revenue Share</h3>
                        <table className="profit-report-table">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th className="text-right">Revenue</th>
                                    <th className="text-right">Share</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topCategories.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="text-center">No sales mix data for this range.</td>
                                    </tr>
                                ) : (
                                    topCategories.map((category) => (
                                        <tr key={category.categoryId ?? category.categoryName}>
                                            <td>{category.categoryName}</td>
                                            <td className="text-right">{formatMoney(category.revenue)}</td>
                                            <td className="text-right">{formatPercent(category.percentage)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        {categoryOverflow > 0 && (
                            <p className="profit-report-more">+{categoryOverflow} more categories</p>
                        )}
                    </div>

                    <div>
                        <h3 className="profit-report-subtitle">Top Product Revenue Share</h3>
                        <table className="profit-report-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th className="text-right">Revenue</th>
                                    <th className="text-right">Share</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="text-center">No item sales mix data for this range.</td>
                                    </tr>
                                ) : (
                                    topItems.map((item) => {
                                        const percentage = totalItemRevenue > 0 ? (item.revenue / totalItemRevenue) * 100 : 0
                                        return (
                                            <tr key={item.productId}>
                                                <td>{item.productName}</td>
                                                <td className="text-right">{formatMoney(item.revenue)}</td>
                                                <td className="text-right">{formatPercent(percentage)}</td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                        {itemOverflow > 0 && (
                            <p className="profit-report-more">+{itemOverflow} more products</p>
                        )}
                    </div>
                </div>
            </section>

            <section className="profit-report-section print-page-break">
                <h2 className="profit-report-section-title">3. Product Profitability</h2>
                <table className="profit-report-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th className="text-right">Qty Sold</th>
                            <th className="text-right">Revenue</th>
                            <th className="text-right">Cost</th>
                            <th className="text-right">Profit</th>
                            <th className="text-right">Margin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center">No product profitability data for this range.</td>
                            </tr>
                        ) : (
                            products.map((product) => (
                                <tr key={product.productId}>
                                    <td>{product.productName}</td>
                                    <td className="text-right">{product.soldQty.toLocaleString('en-US')}</td>
                                    <td className="text-right">{formatMoney(product.revenue)}</td>
                                    <td className="text-right">{formatMoney(product.cost)}</td>
                                    <td className="text-right">{formatMoney(product.profit)}</td>
                                    <td className="text-right">{formatPercent(product.margin)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </section>

            <section className="profit-report-section print-page-break">
                <h2 className="profit-report-section-title">4. Vendor Profitability</h2>
                <table className="profit-report-table">
                    <thead>
                        <tr>
                            <th>Vendor</th>
                            <th className="text-right">Orders</th>
                            <th className="text-right">Revenue</th>
                            <th className="text-right">Profit</th>
                            <th className="text-right">Margin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vendors.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center">No vendor profitability data for this range.</td>
                            </tr>
                        ) : (
                            vendors.map((vendor) => (
                                <tr key={vendor.vendorId}>
                                    <td>{vendor.vendorName}</td>
                                    <td className="text-right">{vendor.orderCount.toLocaleString('en-US')}</td>
                                    <td className="text-right">{formatMoney(vendor.revenue)}</td>
                                    <td className="text-right">{formatMoney(vendor.profit)}</td>
                                    <td className="text-right">{formatPercent(vendor.margin)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </section>

            <section className="profit-report-section print-page-break">
                <h2 className="profit-report-section-title">5. Time Reports</h2>
                <table className="profit-report-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th className="text-right">Revenue</th>
                            <th className="text-right">Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {timeSeries.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="text-center">No time report data for this range.</td>
                            </tr>
                        ) : (
                            timeSeries.map((point) => (
                                <tr key={point.date}>
                                    <td>{point.date}</td>
                                    <td className="text-right">{formatMoney(point.revenue)}</td>
                                    <td className="text-right">{formatMoney(point.profit)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </section>

            <section className="profit-report-section print-page-break">
                <h2 className="profit-report-section-title">6. Hidden Loss Detector</h2>
                <table className="profit-report-table">
                    <thead>
                        <tr>
                            <th>Signal</th>
                            <th className="text-right">Severity</th>
                            <th>Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {signals.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="text-center">
                                    No hidden loss signals detected for this range.
                                </td>
                            </tr>
                        ) : (
                            signals.map((signal, index) => (
                                <tr key={`${signal.type}-${index}`}>
                                    <td>{formatSignalType(signal.type)}</td>
                                    <td className="text-right">{formatSignalSeverity(signal.severity)}</td>
                                    <td>{signal.message}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </section>

            <div className="profit-report-footer">
                <span>Generated by Your Supply Bridge</span>
                <span className="profit-report-page-count" />
            </div>
        </div>
    )
}
