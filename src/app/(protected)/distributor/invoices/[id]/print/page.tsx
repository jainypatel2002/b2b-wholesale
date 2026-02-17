import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { InvoicePrint } from '@/components/invoice-print'
import { notFound } from 'next/navigation'

export default async function DistributorInvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { distributorId, profile } = await getDistributorContext()
    const supabase = await createClient()

    // Fetch Invoice with Items + Vendor + Distributor(Business Name fallback)
    const { data: invoice } = await supabase
        .from('invoices')
        .select(`
      *,
      invoice_items(qty, unit_price, products(name)),
      vendor:profiles!vendor_id(business_name, email, phone)
    `)
        .eq('id', id)
        .eq('distributor_id', distributorId)
        .single()

    if (!invoice) return notFound()

    // Distributor Info (from profile or maybe fallback if business_name isn't on profile)
    // Assuming profile has business_name
    const p = profile as any
    const distributorInfo = {
        business_name: p.business_name || 'Distributor',
        email: p.email
    }

    return <InvoicePrint invoice={invoice} distributor={distributorInfo} vendor={invoice.vendor} />
}
