import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function VendorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { vendorId, profile } = await getVendorContext()
    const supabase = await createClient()

    const { data: invoice } = await supabase
        .from('invoices')
        .select(`
            *,
            invoice_items(qty, unit_price, unit_cost, products(name), item_code, upc, category_name, effective_units, ext_amount, is_manual, product_name),
            invoice_taxes(*),
            distributor:profiles!invoices_distributor_id_fkey(display_name, email)
        `)
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .single()

    if (!invoice) return notFound()

    const p = profile as any
    const vendorInfo = {
        business_name: p.display_name || p.email || 'Vendor',
        email: p.email,
        phone: p.phone,
    }

    const distributorInfo = invoice.distributor ? {
        business_name: invoice.distributor.display_name || invoice.distributor.email,
        email: invoice.distributor.email,
        phone: invoice.distributor.phone
    } : undefined

    return <InvoicePrint invoice={invoice} distributor={distributorInfo} vendor={vendorInfo} />
}
