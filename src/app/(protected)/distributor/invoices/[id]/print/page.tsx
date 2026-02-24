import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { getMyBusinessProfile, getVendorBusinessProfileForInvoice } from '@/lib/business-profiles'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DistributorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { distributorId } = await getDistributorContext()
    const supabase = await createClient()

    // Fetch invoice with snapshots and line details.
    const { data: invoice } = await supabase
        .from('invoices')
        .select(`
            *,
            invoice_items(
                qty, unit_price, unit_cost, products(name), item_code, upc,
                effective_units, ext_amount, is_manual, product_name,
                product_name_snapshot, category_name_snapshot, order_mode, 
                quantity_snapshot, line_total_snapshot,
                unit_price_snapshot, case_price_snapshot, units_per_case_snapshot
            ),
            invoice_taxes(*)
        `)
        .eq('id', id)
        .eq('distributor_id', distributorId)
        .single()

    if (!invoice) return notFound()

    const [distributorInfo, vendorInfo] = await Promise.all([
        getMyBusinessProfile(),
        getVendorBusinessProfileForInvoice(invoice.vendor_id, { distributorId, invoiceId: id })
    ])

    return <InvoicePrint invoice={invoice} distributor={distributorInfo} vendor={vendorInfo ?? undefined} />
}
