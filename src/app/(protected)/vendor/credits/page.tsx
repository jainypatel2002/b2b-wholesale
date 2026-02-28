import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { computeVendorCreditBalance } from '@/lib/credits/calc'
import { formatMoney } from '@/lib/pricing-engine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

function formatLedgerType(type: string): string {
    switch (type) {
        case 'credit_add':
            return 'Credit Added'
        case 'credit_deduct':
            return 'Credit Deducted'
        case 'credit_apply':
            return 'Credit Applied'
        case 'credit_reversal':
            return 'Credit Reversal'
        default:
            return type
    }
}

function signedAmount(type: string, amount: number): string {
    const sign = type === 'credit_add' || type === 'credit_reversal' ? '+' : '-'
    return `${sign}${formatMoney(amount)}`
}

export default async function VendorCreditsPage() {
    const { vendorId, distributorId } = await getVendorContext({ strict: false })
    const supabase = await createClient()

    if (!distributorId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Credit Balance</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-600">No active distributor selected. Connect to a distributor first.</p>
                </CardContent>
            </Card>
        )
    }

    const [{ data: distributor }, { data: ledgerRows, error: ledgerError }] = await Promise.all([
        supabase
            .from('profiles')
            .select('display_name,email')
            .eq('id', distributorId)
            .maybeSingle(),
        supabase
            .from('vendor_credit_ledger')
            .select('id,type,amount,note,order_id,invoice_id,created_at')
            .eq('vendor_id', vendorId)
            .eq('distributor_id', distributorId)
            .order('created_at', { ascending: false })
            .limit(200),
    ])

    if (ledgerError) {
        return (
            <Card className="border-red-200 bg-red-50">
                <CardHeader>
                    <CardTitle>Credit Balance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-red-700">Unable to load credit history: {ledgerError.message}</p>
                    <p className="text-xs text-red-600">Ask your distributor to apply the latest credit migration.</p>
                </CardContent>
            </Card>
        )
    }

    const balance = computeVendorCreditBalance((ledgerRows ?? []).map((row) => ({
        type: row.type,
        amount: row.amount,
    })))
    const distributorName = distributor?.display_name || distributor?.email || 'Distributor'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Credits</h1>
                    <p className="text-sm text-slate-500">Read-only credit history for {distributorName}.</p>
                </div>
                <Link href="/vendor">
                    <Button variant="ghost" size="sm" className="pl-0">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                    </Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium uppercase text-slate-500">Available Credit</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-emerald-700">{formatMoney(balance)}</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium uppercase text-slate-500">Credit History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Type</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3 text-left">Note</th>
                                    <th className="px-4 py-3 text-left">Linked</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(ledgerRows ?? []).length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-6 text-slate-500" colSpan={5}>No credit activity yet.</td>
                                    </tr>
                                ) : (
                                    (ledgerRows ?? []).map((row: any) => (
                                        <tr key={row.id} className="border-t border-slate-100 align-top">
                                            <td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                                            <td className="px-4 py-3 font-medium text-slate-800">{formatLedgerType(String(row.type))}</td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                                <span className={String(row.type) === 'credit_add' || String(row.type) === 'credit_reversal' ? 'text-emerald-700' : 'text-rose-700'}>
                                                    {signedAmount(String(row.type), Number(row.amount ?? 0))}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{row.note ? String(row.note) : '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {row.order_id ? (
                                                    <Link href={`/vendor/orders/${row.order_id}`} className="text-primary hover:underline">
                                                        Order
                                                    </Link>
                                                ) : null}
                                                {row.order_id && row.invoice_id ? <span className="px-1 text-slate-400">·</span> : null}
                                                {row.invoice_id ? (
                                                    <Link href={`/vendor/invoices/${row.invoice_id}`} className="text-primary hover:underline">
                                                        Invoice
                                                    </Link>
                                                ) : null}
                                                {!row.order_id && !row.invoice_id ? '—' : null}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
