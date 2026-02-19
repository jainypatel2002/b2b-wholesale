
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
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                            <TableHead className="text-right">Profit</TableHead>
                            <TableHead className="text-right">Margin</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24">No data available for this period.</TableCell>
                            </TableRow>
                        ) : (
                            data.map((item) => (
                                <TableRow key={item.productId}>
                                    <TableCell className="font-medium">
                                        {item.productName}
                                        {item.isEstimated && (
                                            <Badge variant="outline" className="ml-2 text-[10px] h-5">Est.</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">{item.soldQty}</TableCell>
                                    <TableCell className="text-right">{formatMoney(item.revenue)}</TableCell>
                                    <TableCell className="text-right">{formatMoney(item.cost)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatMoney(item.profit)}</TableCell>
                                    <TableCell className="text-right">
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
            </CardContent>
        </Card>
    )
}
