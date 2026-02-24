
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
import { AlertCircle } from "lucide-react"

export function ProductProfitabilityTab({ data }: { data: ProductProfitability[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Product Profitability</CardTitle>
            </CardHeader>
            <CardContent className="max-w-full">
                {/* Mobile fix: table previously caused full-page overflow; horizontal swipe stays inside card with sticky first column. */}
                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-6 bg-gradient-to-r from-white to-transparent md:hidden" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6 bg-gradient-to-l from-white to-transparent md:hidden" />
                    <Table className="min-w-[720px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 z-[3] min-w-[190px] bg-white">Product</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
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
                                data.map((item) => (
                                    <TableRow key={item.productId}>
                                        <TableCell className="sticky left-0 z-[2] min-w-[190px] bg-white font-medium shadow-[8px_0_12px_-10px_rgba(15,23,42,0.45)]">
                                            <span className="block max-w-[170px] truncate" title={item.productName}>{item.productName}</span>
                                            {item.isEstimated && (
                                                <Badge variant="outline" className="mt-1 h-5 text-[10px]">Est.</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{item.soldQty}</TableCell>
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
                                )))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
