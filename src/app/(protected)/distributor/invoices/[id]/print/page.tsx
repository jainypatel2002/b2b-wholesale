import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DistributorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { distributorId, profile } = await getDistributorContext()
    const supabase = await createClient()

    // Fetch Invoice with Items + Vendor + Distributor(Display Name fallback)
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
            invoice_taxes(*),
            vendor:profiles!invoices_vendor_id_fkey(display_name, email, phone, location_address)
        `)
        .eq('id', id)
        .eq('distributor_id', distributorId)
        .single()

    if (!invoice) return notFound()

    // Distributor Info (from profile or maybe fallback if display_name isn't on profile)
    const p = profile as any
    const distributorInfo = {
        business_name: p.display_name || p.email || 'Distributor',
        email: p.email
    }

    // Vendor Info mapping
    const vendorInfo = invoice.vendor ? {
        business_name: invoice.vendor.display_name || invoice.vendor.email,
        email: invoice.vendor.email,
        phone: invoice.vendor.phone
    } : undefined

    return <InvoicePrint invoice={invoice} distributor={distributorInfo} vendor={vendorInfo} />
}
