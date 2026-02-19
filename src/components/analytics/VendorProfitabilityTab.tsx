
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

export function VendorProfitabilityTab({ data }: { data: VendorProfitability[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Vendor Profitability</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Profit</TableHead>
                            <TableHead className="text-right">Margin</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24">No data available for this period.</TableCell>
                            </TableRow>
                        ) : (
                            data.map((item) => (
                                <TableRow key={item.vendorId}>
                                    <TableCell className="font-medium">{item.vendorName}</TableCell>
                                    <TableCell className="text-right">{item.orderCount}</TableCell>
                                    <TableCell className="text-right">{formatMoney(item.revenue)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatMoney(item.profit)}</TableCell>
                                    <TableCell className="text-right">{formatPercent(item.margin)}</TableCell>
                                </TableRow>
                            )))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
