
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { formatMoney } from "@/lib/analytics/calc"
import { TimeSeriesPoint } from "@/lib/analytics/profit"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function TimePeriodReportsTab({ data }: { data: TimeSeriesPoint[] }) {
    // Simple table view as requested to avoid heavy chart libs
    return (
        <Card>
            <CardHeader>
                <CardTitle>Performance Over Time</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Profit</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">No data for this period.</TableCell>
                            </TableRow>
                        ) : (
                            data.map((point) => (
                                <TableRow key={point.date}>
                                    <TableCell>{point.date}</TableCell>
                                    <TableCell className="text-right">{formatMoney(point.revenue)}</TableCell>
                                    <TableCell className="text-right text-green-600 font-medium">
                                        {formatMoney(point.profit)}
                                    </TableCell>
                                </TableRow>
                            )))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
