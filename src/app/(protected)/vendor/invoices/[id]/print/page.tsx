import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { getMyBusinessProfile } from '@/lib/business-profiles'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function VendorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { vendorId } = await getVendorContext()
    const supabase = await createClient()

    const selectWithCredit = `
            id, invoice_number, subtotal, tax, total, credit_applied, created_at, payment_status, paid_at, terms, notes,
            seller_profile, buyer_profile,
            invoice_items(
                qty, unit_price, unit_cost, item_code, upc,
                effective_units, ext_amount, is_manual, product_name,
                product_name_snapshot, category_name_snapshot, order_mode, 
                quantity_snapshot, line_total_snapshot,
                unit_price_snapshot, case_price_snapshot, units_per_case_snapshot
            ),
            invoice_taxes(*),
            distributor:profiles!invoices_distributor_id_fkey(display_name, email, phone, location_address)
        `
    const selectWithoutCredit = `
            id, invoice_number, subtotal, tax, total, created_at, payment_status, paid_at, terms, notes,
            seller_profile, buyer_profile,
            invoice_items(
                qty, unit_price, unit_cost, item_code, upc,
                effective_units, ext_amount, is_manual, product_name,
                product_name_snapshot, category_name_snapshot, order_mode, 
                quantity_snapshot, line_total_snapshot,
                unit_price_snapshot, case_price_snapshot, units_per_case_snapshot
            ),
            invoice_taxes(*),
            distributor:profiles!invoices_distributor_id_fkey(display_name, email, phone, location_address)
        `

    let invoiceResult = (await supabase
        .from('invoices')
        .select(selectWithCredit)
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .single()) as any

    if (invoiceResult.error?.code === '42703') {
        invoiceResult = (await supabase
            .from('invoices')
            .select(selectWithoutCredit)
            .eq('id', id)
            .eq('vendor_id', vendorId)
            .single()) as any
    }

    const invoiceErr = invoiceResult.error
    const invoice = invoiceResult.data ? { ...invoiceResult.data, credit_applied: invoiceResult.data.credit_applied ?? 0 } : null

    if (invoiceErr) {
        console.error('[VendorInvoicePrintPage] Query Error:', invoiceErr)
    }

    if (!invoice) return notFound()

    const vendorInfo = await getMyBusinessProfile()

    const dist = Array.isArray(invoice.distributor) ? invoice.distributor[0] : invoice.distributor
    const distributorInfo = dist ? {
        business_name: dist.display_name || dist.email || 'Distributor',
        email: dist.email,
        phone: dist.phone,
        address_line1: dist.location_address
    } : undefined

    return <InvoicePrint invoice={invoice} distributor={distributorInfo} vendor={vendorInfo} />
}
