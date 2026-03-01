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
import { computeAmountDue } from '@/lib/credits/calc'
import { toNumber } from '@/lib/number'
import { OrderPaymentPanel } from '@/components/orders/order-payment-panel'

export default async function VendorInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const selectWithCredit = `
        id, order_id, distributor_id, invoice_number, subtotal, tax, total, credit_applied, created_at, payment_status, paid_at, terms, notes,
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
    `
  const selectWithoutCredit = `
        id, order_id, distributor_id, invoice_number, subtotal, tax, total, created_at, payment_status, paid_at, terms, notes,
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
    `

  let invoiceResult = await supabase
    .from('invoices')
    .select(selectWithCredit)
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .maybeSingle()

  if (invoiceResult.error?.code === '42703') {
    invoiceResult = await supabase
      .from('invoices')
      .select(selectWithoutCredit)
      .eq('id', id)
      .eq('vendor_id', vendorId)
      .maybeSingle()
  }

  const invoice = invoiceResult.data ? { ...invoiceResult.data, credit_applied: (invoiceResult.data as any).credit_applied ?? 0 } : null
  const invoiceErr = invoiceResult.error

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

  // --- ADDED: Fetch order amounts & payments since we need to show Amount Due Panel ---
  const orderResult = await supabase
    .from('orders')
    .select('id, total_amount, amount_paid, amount_due')
    .eq('id', invoice.order_id)
    .maybeSingle()

  const paymentsResult = await supabase
    .from('order_payments')
    .select('id, amount, method, note, paid_at, created_at')
    .eq('order_id', invoice.order_id)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  const orderData = orderResult.data
  const paymentsFeatureUnavailable = paymentsResult.error?.code === '42P01'

  // Safety fallback if order is missing but invoice somehow isn't
  const rawTotal = toNumber(orderData?.total_amount ?? invoice.total ?? 0, 0)
  const rawPaid = toNumber(orderData?.amount_paid ?? 0, 0)
  const rawDue = Math.max(toNumber(orderData?.amount_due ?? (rawTotal - rawPaid), 0), 0)

  const totalAmount = Number.isFinite(rawTotal) ? rawTotal : 0
  const amountPaid = Number.isFinite(rawPaid) ? rawPaid : 0
  const amountDue = Number.isFinite(rawDue) ? rawDue : 0

  const payments = (
    paymentsFeatureUnavailable ? [] : (paymentsResult.data ?? [])
  ).map((row: any) => ({
    id: String(row.id),
    amount: toNumber(row.amount, 0),
    method: row.method == null ? null : String(row.method),
    note: row.note == null ? null : String(row.note),
    paid_at: String(row.paid_at || row.created_at || new Date().toISOString()),
  }))

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
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100/75 shadow-inner">
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
                  <span className="truncate ml-4">{formatMoney(totalAmount)}</span>
                </div>
                <div className="flex justify-between font-medium text-emerald-700">
                  <span>Paid</span>
                  <span className="truncate ml-4">{formatMoney(amountPaid)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold text-amber-900">
                  <span>Amount Due</span>
                  <span className="truncate ml-4">{formatMoney(amountDue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Panel strictly for Amount Due Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsFeatureUnavailable ? (
                <p className="text-xs text-amber-700">
                  Payments are unavailable in this environment. Order-linked amount due system pending migration.
                </p>
              ) : (
                <OrderPaymentPanel
                  orderId={invoice.order_id}
                  totalAmount={totalAmount}
                  amountPaid={amountPaid}
                  amountDue={amountDue}
                  payments={payments}
                  canRecordPayment={false}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
