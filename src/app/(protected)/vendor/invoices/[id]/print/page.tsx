import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export default async function VendorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { vendorId, profile } = await getVendorContext()
    const supabase = await createClient()

    const { data: invoice } = await supabase
        .from('invoices')
        .select(`
      *,
      invoice_items(qty, unit_price, products(name)),
      distributor:profiles!distributor_id(business_name, email, phone)
    `)
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .single()

    if (!invoice) return notFound()

    const p = profile as any
    const vendorInfo = {
        business_name: p.business_name || 'Vendor',
        email: p.email,
        phone: p.phone,
    }

    return <InvoicePrint invoice={invoice} distributor={invoice.distributor} vendor={vendorInfo} />
}
