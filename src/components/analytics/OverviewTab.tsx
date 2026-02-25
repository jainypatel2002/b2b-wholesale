
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrencyCompact, formatMoney, formatPercent } from "@/lib/analytics/calc"
import { ProfitOverview } from "@/lib/analytics/profit"
import { AlertCircle, ArrowUpRight, ArrowDownRight, DollarSign, Package } from "lucide-react"
import { cn } from "@/lib/utils"

function KpiValue({
    displayValue,
    fullValue,
    toneClassName,
    showMobileFullValue = false
}: {
    displayValue: string
    fullValue: string
    toneClassName?: string
    showMobileFullValue?: boolean
}) {
    return (
        <div className="min-w-0">
            <p
                title={fullValue}
                className={cn(
                    "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-bold leading-tight tabular-nums [font-size:clamp(18px,2.2vw,30px)]",
                    toneClassName
                )}
            >
                {displayValue}
            </p>
            {showMobileFullValue && (
                <p className="mt-1 break-all text-right text-[11px] text-slate-500 sm:hidden">
                    {fullValue}
                </p>
            )}
        </div>
    )
}

export function OverviewTab({ data }: { data: ProfitOverview }) {
    if (!data) return <div className="p-4">Loading overview...</div>

    const isProfitable = data.profit >= 0
    const revenueFull = formatMoney(data.revenue)
    const revenueDisplay = formatCurrencyCompact(data.revenue)
    const costFull = formatMoney(data.cost)
    const costDisplay = formatCurrencyCompact(data.cost)
    const profitFull = formatMoney(data.profit)
    const profitDisplay = formatCurrencyCompact(data.profit)
    const marginFull = formatPercent(data.margin)

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="min-w-0">
                    <KpiValue
                        displayValue={revenueDisplay}
                        fullValue={revenueFull}
                        showMobileFullValue={revenueDisplay !== revenueFull}
                    />
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                        {data.orderCount} orders
                    </p>
                </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Cost of Goods</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="min-w-0">
                    <KpiValue
                        displayValue={costDisplay}
                        fullValue={costFull}
                        showMobileFullValue={costDisplay !== costFull}
                    />
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                        Estimated basics
                    </p>
                </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                    {isProfitable ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                    ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                    )}
                </CardHeader>
                <CardContent className="min-w-0">
                    <KpiValue
                        displayValue={profitDisplay}
                        fullValue={profitFull}
                        showMobileFullValue={profitDisplay !== profitFull}
                        toneClassName={isProfitable ? "text-green-600" : "text-red-500"}
                    />
                </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="min-w-0">
                    <KpiValue displayValue={marginFull} fullValue={marginFull} />
                    {data.margin < 10 && (
                        <p className="mt-1 flex items-center justify-end text-xs text-amber-600">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            Low margin warning
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Placeholder for Outstanding - if invoices structure known later */}
        </div>
    )
}
