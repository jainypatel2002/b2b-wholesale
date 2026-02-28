import { ProfitCenterPrintSummary } from '@/components/analytics/ProfitCenterPrintSummary'
import { buildCategoryProfitability } from '@/lib/analytics/categoryProfitability'
import {
  getProfitOverview,
  getProductProfitability
} from '@/lib/analytics/profit'
import { getEffectiveAnalyticsRange, getLatestProfitReset } from '@/lib/analytics/profitReset'
import { getCategorySalesMix, getItemSalesMix } from '@/lib/analytics/salesMix'
import { requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function parseDateParam(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default async function ProfitPrintSummaryPage(props: PageProps) {
  const searchParams = await props.searchParams
  const profile = await requireRole('distributor')
  const distributorId = profile.id

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)

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
  const generatedAt = new Date()

  const latestReset = await getLatestProfitReset(distributorId)
  const resetAt = latestReset?.reset_at ? new Date(latestReset.reset_at) : null
  const selectedRangeBeforeReset = getEffectiveAnalyticsRange(range, resetAt).selectedRangeBeforeReset
  const options = { resetAt }

  const [overview, products, categoryMix, itemMix] = await Promise.all([
    getProfitOverview(distributorId, range, options),
    getProductProfitability(distributorId, range, options),
    getCategorySalesMix(distributorId, range, options),
    getItemSalesMix(distributorId, range, options)
  ])

  const categoryProfitability = buildCategoryProfitability({
    products,
    items: itemMix,
    categories: categoryMix
  })

  return (
    <div className="flex-1 p-4 md:p-6 print:p-0">
      <ProfitCenterPrintSummary
        overview={overview}
        categoryProfitability={categoryProfitability}
        dateRange={range}
        distributorName={profile.display_name || profile.email || 'Distributor'}
        generatedAt={generatedAt}
        lastResetAt={latestReset?.reset_at ?? null}
        selectedRangeBeforeReset={selectedRangeBeforeReset}
      />
    </div>
  )
}
