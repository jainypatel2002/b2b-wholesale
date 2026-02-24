import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { getMyBusinessProfile } from '@/lib/business-profiles'

export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer } from 'lucide-react'
import { InvoicePrint } from '@/components/invoice-print'
import { formatMoney } from '@/lib/pricing-engine'

export default async function VendorInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { data: invoice, error: invoiceErr } = await supabase
    .from('invoices')
    .select(`
        id, distributor_id, invoice_number, subtotal, tax, total, created_at, payment_status, paid_at, terms, notes,
        seller_profile, buyer_profile,
        invoice_items(
            qty, unit_price, unit_cost, item_code, upc,
            effective_units, ext_amount, is_manual, product_name, 
            order_unit, units_per_case_snapshot,
            product_name_snapshot, category_name_snapshot, order_mode, 
            quantity_snapshot, line_total_snapshot,
            unit_price_snapshot, case_price_snapshot
        ),
        invoice_taxes(*),
        distributor:profiles!invoices_distributor_id_fkey(display_name, email, phone, location_address)
    `)
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .maybeSingle()

  if (invoiceErr) {
    console.error('[VendorInvoiceDetailPage] Query Error raw:', invoiceErr)
    console.error('[VendorInvoiceDetailPage] Query Error details:', {
      code: invoiceErr.code,
      message: invoiceErr.message,
      details: invoiceErr.details,
      hint: invoiceErr.hint
    })
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Link href="/vendor/invoices">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices</Button>
        </Link>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">Invoice not found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const vendorBusinessProfile = await getMyBusinessProfile()
  const dist = Array.isArray(invoice.distributor) ? invoice.distributor[0] : invoice.distributor
  const distributorFallback = dist ? {
    business_name: dist.display_name || dist.email || 'Distributor',
    email: dist.email,
    phone: dist.phone,
    address_line1: dist.location_address
  } : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/vendor/invoices">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices</Button>
        </Link>
        <Link href={`/vendor/invoices/${id}/print`} target="_blank">
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" /> Print Invoice
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content: Invoice Document View */}
        <div className="md:col-span-2">
          <div className="bg-slate-100 rounded-xl overflow-hidden shadow-inner border border-slate-200">
            <div className="scale-[0.85] origin-top transform-gpu -mb-[15%]">
              {/* Reuse the print layout but inject it inline as a "document view" */}
              <div className="pointer-events-none">
                <InvoicePrint
                  invoice={invoice}
                  vendor={vendorBusinessProfile}
                  distributor={distributorFallback}
                  isEmbedded={true}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{invoice.invoice_number}</h1>
                <div className="text-sm text-slate-500 mt-1">
                  Created: {new Date(invoice.created_at).toLocaleDateString()}
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-500 block mb-1">Status</span>
                <StatusBadge status={invoice.payment_status} type="payment" />
                {invoice.paid_at && (
                  <div className="mt-1 text-xs text-slate-500">
                    Paid: {new Date(invoice.paid_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatMoney(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tax</span>
                  <span className="font-medium">{formatMoney(invoice.tax)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold">
                  <span>Total</span>
                  <span>{formatMoney(invoice.total)}</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 pt-2">Payment method: cash</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
