'use client'

import { useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { formatMoney, formatPercent } from '@/lib/analytics/calc'
import type { CategoryProfitability } from '@/lib/analytics/categoryProfitability'
import type { ProfitOverview } from '@/lib/analytics/profit'

const DEFAULT_CATEGORY_LIMIT = 10

interface ProfitCenterPrintSummaryProps {
  overview: ProfitOverview
  categoryProfitability: CategoryProfitability[]
  dateRange: { from: Date; to: Date }
  distributorName: string
  generatedAt: Date
  lastResetAt: string | null
  selectedRangeBeforeReset: boolean
  categoryLimit?: number
}

function formatDateLabel(value: Date) {
  return format(value, 'MMM d, yyyy')
}

function formatDateTimeLabel(value: Date) {
  return format(value, "MMM d, yyyy 'at' h:mm a")
}

export function ProfitCenterPrintSummary({
  overview,
  categoryProfitability,
  dateRange,
  distributorName,
  generatedAt,
  lastResetAt,
  selectedRangeBeforeReset,
  categoryLimit = DEFAULT_CATEGORY_LIMIT
}: ProfitCenterPrintSummaryProps) {
  const topCategories = useMemo(
    () => categoryProfitability.slice(0, categoryLimit),
    [categoryLimit, categoryProfitability]
  )
  const hiddenCategoryCount = Math.max(0, categoryProfitability.length - topCategories.length)

  const parsedResetDate = useMemo(() => {
    if (!lastResetAt) return null
    const parsed = new Date(lastResetAt)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }, [lastResetAt])

  useEffect(() => {
    const printTimer = window.setTimeout(() => window.print(), 300)
    const handleAfterPrint = () => {
      if (window.opener) {
        window.close()
      }
    }

    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.clearTimeout(printTimer)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  return (
    <div id="profit-center-summary-print" className="text-slate-900">
      <div className="no-print mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Print / Save PDF
        </button>
      </div>

      <article className="summary-shell mx-auto w-full max-w-[920px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="summary-header border-b border-slate-200 pb-3">
          <h1 className="summary-title text-[22px] font-bold leading-tight text-slate-900">
            Your Supply Bridge - Profit Center Summary
          </h1>
          <div className="summary-meta mt-2 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-slate-700">Distributor:</span> {distributorName || 'Distributor'}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Generated:</span> {formatDateTimeLabel(generatedAt)}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Date range:</span>{' '}
              {formatDateLabel(dateRange.from)} - {formatDateLabel(dateRange.to)}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Since last reset:</span>{' '}
              {parsedResetDate ? formatDateTimeLabel(parsedResetDate) : 'Not reset yet'}
            </p>
          </div>
          {selectedRangeBeforeReset && (
            <p className="summary-note mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
              Selected range is before last reset. Metrics are zero for this range.
            </p>
          )}
        </header>

        <section className="mt-3">
          <h2 className="summary-section-title text-sm font-semibold text-slate-800">Overview</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="summary-kpi-label text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Revenue</p>
              <p className="summary-kpi-value mt-1 text-[15px] font-bold text-slate-900">{formatMoney(overview.revenue)}</p>
            </div>
            <div className="summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="summary-kpi-label text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cost of Goods</p>
              <p className="summary-kpi-value mt-1 text-[15px] font-bold text-slate-900">{formatMoney(overview.cost)}</p>
            </div>
            <div className="summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="summary-kpi-label text-[10px] font-semibold uppercase tracking-wide text-slate-500">Net Profit</p>
              <p className="summary-kpi-value mt-1 text-[15px] font-bold text-slate-900">{formatMoney(overview.profit)}</p>
            </div>
            <div className="summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="summary-kpi-label text-[10px] font-semibold uppercase tracking-wide text-slate-500">Avg Margin</p>
              <p className="summary-kpi-value mt-1 text-[15px] font-bold text-slate-900">{formatPercent(overview.margin)}</p>
            </div>
            <div className="summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="summary-kpi-label text-[10px] font-semibold uppercase tracking-wide text-slate-500">Orders Count</p>
              <p className="summary-kpi-value mt-1 text-[15px] font-bold text-slate-900">{overview.orderCount.toLocaleString('en-US')}</p>
            </div>
            <div className="summary-card rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="summary-kpi-label text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last Reset</p>
              <p className="summary-kpi-value summary-kpi-value-text mt-1 text-[12px] font-semibold text-slate-900">
                {parsedResetDate ? formatDateTimeLabel(parsedResetDate) : 'Not reset yet'}
              </p>
            </div>
          </div>
        </section>

        <section className="summary-table-wrap mt-4">
          <h2 className="summary-section-title text-sm font-semibold text-slate-800">Profit by Categories</h2>
          <table className="summary-table mt-2 w-full border-collapse border border-slate-300">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Category
                </th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Revenue
                </th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Cost
                </th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Profit
                </th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Margin %
                </th>
              </tr>
            </thead>
            <tbody>
              {topCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-slate-300 px-2 py-4 text-center text-[11px] text-slate-500">
                    No category profitability data for this range.
                  </td>
                </tr>
              ) : (
                topCategories.map((row) => (
                  <tr key={row.categoryId ?? row.categoryName}>
                    <td className="border border-slate-300 px-2 py-1 text-[10px] text-slate-800">{row.categoryName}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right text-[10px] text-slate-800">
                      {formatMoney(row.revenue)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right text-[10px] text-slate-800">
                      {formatMoney(row.cost)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right text-[10px] text-slate-800">
                      {formatMoney(row.profit)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right text-[10px] text-slate-800">
                      {formatPercent(row.margin)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {hiddenCategoryCount > 0 && (
            <p className="mt-2 text-[11px] text-slate-600">+ {hiddenCategoryCount} more categories not shown</p>
          )}
        </section>

        <footer className="summary-footer mt-4 flex items-center justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
          <span>Generated by Your Supply Bridge</span>
          <span>Page 1 of 1</span>
        </footer>
      </article>

      <style jsx global>{`
        #profit-center-summary-print .summary-table th,
        #profit-center-summary-print .summary-table td,
        #profit-center-summary-print .summary-kpi-value {
          font-variant-numeric: tabular-nums;
        }

        @media print {
          @page {
            size: portrait;
            margin: 12mm;
          }

          body {
            background: #ffffff !important;
          }

          #profit-center-summary-print .summary-shell {
            margin: 0;
            width: 100%;
          }

          #profit-center-summary-print .summary-title {
            font-size: 20px;
          }

          #profit-center-summary-print .summary-meta {
            font-size: 10px;
          }

          #profit-center-summary-print .summary-note {
            font-size: 9.5px;
            padding: 4px 8px;
          }

          #profit-center-summary-print .summary-kpi-label {
            font-size: 9px;
          }

          #profit-center-summary-print .summary-kpi-value {
            font-size: 13px;
            white-space: nowrap;
          }

          #profit-center-summary-print .summary-kpi-value-text {
            font-size: 10px;
            line-height: 1.3;
            white-space: normal;
          }

          #profit-center-summary-print .summary-table th,
          #profit-center-summary-print .summary-table td {
            font-size: 9.5px;
            padding: 4px 6px;
          }

          #profit-center-summary-print .summary-header,
          #profit-center-summary-print .summary-card,
          #profit-center-summary-print .summary-table-wrap,
          #profit-center-summary-print .summary-footer {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
