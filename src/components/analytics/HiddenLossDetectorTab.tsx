
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LossSignal } from "@/lib/analytics/profit"
import { AlertTriangle, AlertCircle, Info } from "lucide-react"

export function HiddenLossDetectorTab({ data }: { data: LossSignal[] }) {

    const getIcon = (type: string) => {
        switch (type) {
            case 'Price Mistake': return <AlertTriangle className="h-5 w-5 text-red-600" />
            case 'Stockout Risk': return <AlertTriangle className="h-5 w-5 text-amber-600" />
            default: return <AlertCircle className="h-5 w-5 text-blue-500" />
        }
    }

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high': return 'bg-red-100 text-red-800 border-red-200'
            case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200'
            default: return 'bg-blue-100 text-blue-800 border-blue-200'
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Hidden Loss Signals</CardTitle>
                    <CardDescription>
                        AI-driven insights to detect potential revenue leaks and risks.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <Info className="h-10 w-10 mb-2 opacity-50" />
                            <p>No issues detected! Your operations look healthy.</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {data.map((signal, idx) => (
                                <div key={idx} className={`flex items-start gap-4 p-4 rounded-lg border ${getSeverityColor(signal.severity)}`}>
                                    <div className="mt-1">{getIcon(signal.type)}</div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold">{signal.type}</h4>
                                            <Badge variant="outline" className="bg-white/50">{signal.severity.toUpperCase()}</Badge>
                                        </div>
                                        <p className="text-sm mt-1">{signal.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
