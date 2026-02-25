
import { ProfitDashboard } from '@/components/analytics/ProfitDashboard'
import {
    getProfitOverview,
    getProductProfitability,
    getVendorProfitability,
    getTimeSeries,
    getHiddenLossSignals
} from '@/lib/analytics/profit'
import { getCategorySalesMix, getItemSalesMix } from '@/lib/analytics/salesMix'
import { requireRole } from '@/lib/auth'
import { getEffectiveAnalyticsRange, getLatestProfitReset } from '@/lib/analytics/profitReset'

// Force dynamic so we don't cache stale analytics
export const dynamic = 'force-dynamic'

type PageProps = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function parseDateParam(value: string | null) {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default async function ProfitPage(props: PageProps) {
    const searchParams = await props.searchParams
    const profile = await requireRole('distributor')
    const distributorId = profile.id

    // Date Range Parsing
    const now = new Date()
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1) // Start of month
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0) // End of month

    const fromParam = typeof searchParams.from === 'string' ? searchParams.from : null
    const toParam = typeof searchParams.to === 'string' ? searchParams.to : null

    const parsedFrom = parseDateParam(fromParam)
    const parsedTo = parseDateParam(toParam)

    let from = parsedFrom || defaultFrom
    let to = parsedTo || defaultTo
    if (from.getTime() > to.getTime()) {
        const swap = from
        from = to
        to = swap
    }

    const range = { from, to }

    try {
        const latestReset = await getLatestProfitReset(distributorId)
        const resetAt = latestReset?.reset_at ? new Date(latestReset.reset_at) : null
        const selectedRangeBeforeReset = getEffectiveAnalyticsRange(range, resetAt).selectedRangeBeforeReset
        const options = { resetAt }

        // Parallel Fetching
        const [overview, products, vendors, timeSeries, signals, catMix, itemMix] = await Promise.all([
            getProfitOverview(distributorId, range, options),
            getProductProfitability(distributorId, range, options),
            getVendorProfitability(distributorId, range, options),
            getTimeSeries(distributorId, range, options),
            getHiddenLossSignals(distributorId, options),
            getCategorySalesMix(distributorId, range, options),
            getItemSalesMix(distributorId, range, options)
        ])

        return (
            <div className="flex-1 space-y-4 p-4 pt-4 md:p-8 md:pt-6">
                <ProfitDashboard
                    overviewArg={overview}
                    productsArg={products}
                    vendorsArg={vendors}
                    timeSeriesArg={timeSeries}
                    signalsArg={signals}
                    dateRangeArg={range}
                    salesMixCategoriesArg={catMix}
                    salesMixItemsArg={itemMix}
                    distributorNameArg={profile.display_name || profile.email || 'Distributor'}
                    distributorEmailArg={profile.email || ''}
                    lastResetAtArg={latestReset?.reset_at ?? null}
                    selectedRangeBeforeResetArg={selectedRangeBeforeReset}
                />
            </div>
        )
    } catch (error) {
        console.error("Analytics Error", error)
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-red-600">Access Denied or System Error</h2>
                <p className="text-muted-foreground mt-2">
                    Unable to load profit analytics. You may not have the required permissions (Distributor only).
                </p>
                <p className="text-xs text-muted-foreground mt-4 font-mono">
                    {error instanceof Error ? error.message : 'Unknown error'}
                </p>
            </div>
        )
    }
}
