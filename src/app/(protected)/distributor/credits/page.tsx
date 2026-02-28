import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { DistributorCreditsPanel } from '@/components/credits/distributor-credits-panel'
import { computeVendorCreditBalance } from '@/lib/credits/calc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function DistributorCreditsPage({
    searchParams,
}: {
    searchParams: Promise<{ vendor?: string }>
}) {
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()
    const { vendor: vendorParam } = await searchParams
    const vendors = await getLinkedVendors(distributorId)

    const selectedVendorId = vendors.some((vendor) => vendor.id === vendorParam)
        ? String(vendorParam)
        : (vendors[0]?.id || '')
    const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId)

    if (!selectedVendorId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Vendor Credits</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-600">No linked vendors found. Link a vendor first to manage credit.</p>
                </CardContent>
            </Card>
        )
    }

    const { data: ledgerRows, error: ledgerError } = await supabase
        .from('vendor_credit_ledger')
        .select('id,type,amount,note,order_id,invoice_id,created_at')
        .eq('distributor_id', distributorId)
        .eq('vendor_id', selectedVendorId)
        .order('created_at', { ascending: false })
        .limit(200)

    if (ledgerError) {
        return (
            <Card className="border-red-200 bg-red-50">
                <CardHeader>
                    <CardTitle>Vendor Credits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-red-700">Unable to load credits: {ledgerError.message}</p>
                    <p className="text-xs text-red-600">Apply the latest migration and refresh this page.</p>
                </CardContent>
            </Card>
        )
    }

    const balance = computeVendorCreditBalance((ledgerRows ?? []).map((row) => ({
        type: row.type,
        amount: row.amount,
    })))

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Vendor Credits</h1>
                    <p className="text-sm text-slate-500">Manual credit ledger and adjustments by vendor.</p>
                </div>
                <form action="/distributor/credits" className="flex items-end gap-2">
                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</label>
                        <select name="vendor" defaultValue={selectedVendorId} className="form-select min-w-[220px]">
                            {vendors.map((vendor) => (
                                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" variant="outline">Load</Button>
                </form>
            </div>

            <DistributorCreditsPanel
                vendorId={selectedVendorId}
                vendorName={selectedVendor?.name || 'Vendor'}
                balance={balance}
                ledger={(ledgerRows ?? []).map((row) => ({
                    id: String(row.id),
                    type: String(row.type),
                    amount: Number(row.amount ?? 0),
                    note: row.note == null ? null : String(row.note),
                    order_id: row.order_id == null ? null : String(row.order_id),
                    invoice_id: row.invoice_id == null ? null : String(row.invoice_id),
                    created_at: String(row.created_at),
                }))}
            />
        </div>
    )
}
