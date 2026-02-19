
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatMoney, formatPercent } from "@/lib/analytics/calc"
import { ProfitOverview } from "@/lib/analytics/profit"
import { AlertCircle, ArrowUpRight, ArrowDownRight, DollarSign, Package } from "lucide-react"

export function OverviewTab({ data }: { data: ProfitOverview }) {
    if (!data) return <div className="p-4">Loading overview...</div>

    const isProfitable = data.profit >= 0

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatMoney(data.revenue)}</div>
                    <p className="text-xs text-muted-foreground">
                        {data.orderCount} orders
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Cost of Goods</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatMoney(data.cost)}</div>
                    <p className="text-xs text-muted-foreground">
                        Estimated basics
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                    {isProfitable ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                    ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                    )}
                </CardHeader>
                <CardContent>
                    <div className={cn("text-2xl font-bold", isProfitable ? "text-green-600" : "text-red-500")}>
                        {formatMoney(data.profit)}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatPercent(data.margin)}</div>
                    {data.margin < 10 && (
                        <p className="flex items-center text-xs text-amber-500">
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

// Helper for conditional classes
function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(" ")
}
