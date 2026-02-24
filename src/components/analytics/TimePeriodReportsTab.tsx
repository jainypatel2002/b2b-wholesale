
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
            <CardContent className="max-w-full">
                {/* Mobile fix: only this table area scrolls horizontally; page-level overflow is prevented. */}
                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-6 bg-gradient-to-r from-white to-transparent md:hidden" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6 bg-gradient-to-l from-white to-transparent md:hidden" />
                    <Table className="min-w-[460px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 z-[3] min-w-[160px] bg-white">Date</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Revenue</TableHead>
                                <TableHead className="whitespace-nowrap text-right">Profit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">No data for this period.</TableCell>
                                </TableRow>
                            ) : (
                                data.map((point) => (
                                    <TableRow key={point.date}>
                                        <TableCell className="sticky left-0 z-[2] min-w-[160px] bg-white font-medium shadow-[8px_0_12px_-10px_rgba(15,23,42,0.45)]">
                                            {point.date}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatMoney(point.revenue)}</TableCell>
                                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums font-medium text-green-600">
                                            {formatMoney(point.profit)}
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
