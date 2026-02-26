import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { formatMoney, formatPercent } from "@/lib/analytics/calc"
import { ProductProfitability } from "@/lib/analytics/profit"
import { MobileMetricsSliderCard } from "@/components/analytics/MobileMetricsSliderCard"
import { AlertCircle } from "lucide-react"

function formatQtyValue(value: number): string {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

function getQtyDisplay(item: ProductProfitability): { primary: string; secondary: string | null } {
    const hasCaseSales = item.soldCases > 0
    const hasUnitSales = item.soldUnits > 0

    let primary = `${formatQtyValue(item.soldUnits)} units`
    if (hasCaseSales && hasUnitSales) {
        primary = `${formatQtyValue(item.soldCases)} cases + ${formatQtyValue(item.soldUnits)} units`
    } else if (hasCaseSales) {
        primary = `${formatQtyValue(item.soldCases)} cases`
    }

    if (item.soldUnitsEquivalent === null) {
        return {
            primary,
            secondary: item.hasUnknownUnitConversion ? 'Units equivalent unavailable' : null
        }
    }

    return {
        primary,
        secondary: `${formatQtyValue(item.soldUnitsEquivalent)} units equivalent`
    }
}

export function ProductProfitabilityTab({ data }: { data: ProductProfitability[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Product Profitability</CardTitle>
            </CardHeader>
            <CardContent className="max-w-full space-y-3">
                <div className="space-y-3 md:hidden">
                    {data.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                            No data available for this period.
                        </div>
                    ) : (
                        data.map((item) => (
                            <MobileMetricsSliderCard
                                key={item.productId}
                                title={<span className="block truncate">{item.productName}</span>}
                                headerRight={
                                    item.isEstimated ? (
                                        <Badge variant="outline" className="h-6 px-2 text-[10px] uppercase tracking-wide">
                                            Est.
                                        </Badge>
                                    ) : undefined
                                }
                                slides={[
                                    {
                                        label: "Sales",
                                        metrics: [
                                            { label: "Cases Sold", value: formatQtyValue(item.soldCases) },
                                            { label: "Units Sold", value: formatQtyValue(item.soldUnits) }
                                        ]
                                    },
                                    {
                                        label: "Revenue",
                                        metrics: [
                                            {
                                                label: "Units Eq.",
                                                value: item.soldUnitsEquivalent === null
                                                    ? "N/A"
                                                    : formatQtyValue(item.soldUnitsEquivalent)
                                            },
                                            { label: "Revenue", value: formatMoney(item.revenue) }
                                        ]
                                    },
                                    {
                                        label: "Cost vs Profit",
                                        metrics: [
                                            { label: "Cost", value: formatMoney(item.cost) },
                                            {
                                                label: "Profit",
                                                value: formatMoney(item.profit),
                                                valueClassName: item.profit >= 0 ? "text-emerald-700" : "text-rose-700"
                                            }
                                        ]
                                    },
                                    {
                                        label: "Margin",
                                        metrics: [
                                            {
                                                label: "Margin %",
                                                value: (
                                                    <span className="inline-flex items-center justify-end gap-1.5">
                                                        {formatPercent(item.margin)}
                                                        {item.margin < 5 ? (
                                                            <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                                                        ) : null}
                                                    </span>
                                                ),
                                                valueClassName: item.margin < 5 ? "text-amber-700" : undefined
                                            }
                                        ]
                                    }
                                ]}
                            />
                        ))
                    )}
                </div>

                <div className="relative hidden md:block">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-6 bg-gradient-to-r from-white to-transparent md:hidden" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6 bg-gradient-to-l from-white to-transparent md:hidden" />
                    <Table className="min-w-[720px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 z-[3] min-w-[190px] bg-white">Product</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Qty (Cases / Units)</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Revenue</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Cost</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Profit</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Margin</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">No data available for this period.</TableCell>
                                </TableRow>
                            ) : (
                                data.map((item) => {
                                    const qtyDisplay = getQtyDisplay(item)
                                    return (
                                        <TableRow key={item.productId}>
                                            <TableCell className="sticky left-0 z-[2] min-w-[190px] bg-white font-medium shadow-[8px_0_12px_-10px_rgba(15,23,42,0.45)]">
                                                <span className="block max-w-[170px] truncate" title={item.productName}>{item.productName}</span>
                                                {item.isEstimated && (
                                                    <Badge variant="outline" className="mt-1 h-5 text-[10px]">Est.</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                                                <div>{qtyDisplay.primary}</div>
                                                {qtyDisplay.secondary && (
                                                    <div className="text-[11px] font-normal text-slate-500">{qtyDisplay.secondary}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatMoney(item.revenue)}</TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatMoney(item.cost)}</TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-mono tabular-nums font-medium">{formatMoney(item.profit)}</TableCell>
                                            <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                                                <div className="flex items-center justify-end gap-2">
                                                    {formatPercent(item.margin)}
                                                    {item.margin < 5 && (
                                                        <div title="Low Margin < 5%">
                                                            <AlertCircle className="h-4 w-4 text-amber-500" />
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                }))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
