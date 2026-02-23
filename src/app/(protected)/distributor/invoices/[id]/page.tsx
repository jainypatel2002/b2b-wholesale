import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'

export const dynamic = 'force-dynamic'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Printer } from 'lucide-react'
import { InvoicePrint } from '@/components/invoice-print'

export default async function DistributorInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { data: invoice, error: invoiceErr } = await supabase
    .from('invoices')
    .select(`
            id, invoice_number, subtotal, tax, total, created_at, payment_status, paid_at, terms, notes,
            invoice_items(qty, unit_price, unit_cost, item_code, upc, category_name, effective_units, ext_amount, is_manual, product_name),
            invoice_taxes(*),
            vendor:profiles!invoices_vendor_id_fkey(display_name, email, phone, location_address)
        `)
    .eq('id', id)
    .eq('distributor_id', distributorId)
    .maybeSingle()

  if (invoiceErr) {
    console.error('[DistributorInvoiceDetailPage] Query Error raw:', invoiceErr)
    console.error('[DistributorInvoiceDetailPage] Query Error details:', {
      code: invoiceErr.code,
      message: invoiceErr.message,
      details: invoiceErr.details,
      hint: invoiceErr.hint
    })
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Link href="/distributor/invoices">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices</Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-slate-500">Invoice not found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const profit = (invoice.invoice_items ?? []).reduce((sum: number, it: any) => sum + (Number(it.unit_price) - Number(it.unit_cost)) * Number(it.qty), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/distributor/invoices">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices</Button>
        </Link>
        <Link href={`/distributor/invoices/${id}/print`} target="_blank">
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
                  vendor={invoice.vendor}
                  distributor={null} // Don't need distributor block on inner view 
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
                  <span className="font-medium">${Number(invoice.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tax</span>
                  <span className="font-medium">${Number(invoice.tax).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold">
                  <span>Total</span>
                  <span>${Number(invoice.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 text-xs text-emerald-600">
                  <span>Profit (est)</span>
                  <span>${profit.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
