
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { formatMoney, formatPercent } from "@/lib/analytics/calc"
import { VendorProfitability } from "@/lib/analytics/profit"
import { MobileMetricsSliderCard } from "@/components/analytics/MobileMetricsSliderCard"

export function VendorProfitabilityTab({ data }: { data: VendorProfitability[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Vendor Profitability</CardTitle>
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
                                key={item.vendorId}
                                title={<span className="block truncate">{item.vendorName}</span>}
                                slides={[
                                    {
                                        label: "Performance",
                                        metrics: [
                                            { label: "Orders", value: item.orderCount.toLocaleString("en-US") },
                                            { label: "Revenue", value: formatMoney(item.revenue) }
                                        ]
                                    },
                                    {
                                        label: "Profitability",
                                        metrics: [
                                            {
                                                label: "Profit",
                                                value: formatMoney(item.profit),
                                                valueClassName: item.profit >= 0 ? "text-emerald-700" : "text-rose-700"
                                            },
                                            { label: "Margin %", value: formatPercent(item.margin) }
                                        ]
                                    }
                                ]}
                            />
                        ))
                    )}
                </div>

                {/* Desktop table remains unchanged for parity with existing workflows. */}
                <div className="relative hidden md:block">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-6 bg-gradient-to-r from-white to-transparent md:hidden" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6 bg-gradient-to-l from-white to-transparent md:hidden" />
                    <Table className="min-w-[640px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 z-[3] min-w-[190px] bg-white">Vendor</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Orders</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Revenue</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Profit</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Margin</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">No data available for this period.</TableCell>
                                </TableRow>
                            ) : (
                                data.map((item) => (
                                    <TableRow key={item.vendorId}>
                                        <TableCell
                                            className="sticky left-0 z-[2] min-w-[190px] bg-white font-medium shadow-[8px_0_12px_-10px_rgba(15,23,42,0.45)]"
                                            title={item.vendorName}
                                        >
                                            <span className="block max-w-[170px] truncate">{item.vendorName}</span>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{item.orderCount}</TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatMoney(item.revenue)}</TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums font-medium">{formatMoney(item.profit)}</TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatPercent(item.margin)}</TableCell>
                                    </TableRow>
                                )))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
