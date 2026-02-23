import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function VendorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { vendorId, profile } = await getVendorContext()
    const supabase = await createClient()

    const { data: invoice, error: invoiceErr } = (await supabase
        .from('invoices')
        .select(`
            id, invoice_number, subtotal, tax, total, created_at, payment_status, paid_at, terms, notes,
            invoice_items(
                qty, unit_price, unit_cost, item_code, upc,
                effective_units, ext_amount, is_manual, product_name,
                product_name_snapshot, category_name_snapshot, order_mode, 
                quantity_snapshot, line_total_snapshot,
                unit_price_snapshot, case_price_snapshot, units_per_case_snapshot
            ),
            invoice_taxes(*),
            distributor:profiles!invoices_distributor_id_fkey(display_name, email, phone)
        `)
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .single()) as any

    if (invoiceErr) {
        console.error('[VendorInvoicePrintPage] Query Error:', invoiceErr)
    }

    if (!invoice) return notFound()

    const p = profile as any
    const vendorInfo = {
        business_name: p.display_name || p.email || 'Vendor',
        email: p.email,
        phone: p.phone,
    }

    const dist = Array.isArray(invoice.distributor) ? invoice.distributor[0] : invoice.distributor
    const distributorInfo = dist ? {
        business_name: dist.display_name || dist.email,
        email: dist.email,
        phone: dist.phone
    } : undefined

    return <InvoicePrint invoice={invoice} distributor={distributorInfo} vendor={vendorInfo} />
}
