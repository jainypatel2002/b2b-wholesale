import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext } from '@/lib/data'
import { getMyBusinessProfile, getVendorBusinessProfileForInvoice } from '@/lib/business-profiles'

export const dynamic = 'force-dynamic'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Printer } from 'lucide-react'
import { InvoicePrint } from '@/components/invoice-print'
import { formatMoney } from '@/lib/pricing-engine'
import { computeAmountDue, computeVendorCreditBalance } from '@/lib/credits/calc'
import { OrderCreditApplyCard } from '@/components/credits/order-credit-apply-card'

export default async function DistributorInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const selectWithCredit = `
            id, order_id, vendor_id, invoice_number, subtotal, tax, total, credit_applied, created_at, payment_status, paid_at, terms, notes,
            seller_profile, buyer_profile,
            invoice_items(
                qty, unit_price, unit_cost, item_code, upc,
                effective_units, ext_amount, is_manual, product_name,
                product_name_snapshot, category_name_snapshot, order_mode, 
                quantity_snapshot, line_total_snapshot,
                unit_price_snapshot, case_price_snapshot, units_per_case_snapshot
            ),
            invoice_taxes(*)
        `
  const selectWithoutCredit = `
            id, order_id, vendor_id, invoice_number, subtotal, tax, total, created_at, payment_status, paid_at, terms, notes,
            seller_profile, buyer_profile,
            invoice_items(
                qty, unit_price, unit_cost, item_code, upc,
                effective_units, ext_amount, is_manual, product_name,
                product_name_snapshot, category_name_snapshot, order_mode, 
                quantity_snapshot, line_total_snapshot,
                unit_price_snapshot, case_price_snapshot, units_per_case_snapshot
            ),
            invoice_taxes(*)
        `

  let invoiceResult = await supabase
    .from('invoices')
    .select(selectWithCredit)
    .eq('id', id)
    .eq('distributor_id', distributorId)
    .maybeSingle()

  if (invoiceResult.error?.code === '42703') {
    invoiceResult = await supabase
      .from('invoices')
      .select(selectWithoutCredit)
      .eq('id', id)
      .eq('distributor_id', distributorId)
      .maybeSingle()
  }

  const invoice = invoiceResult.data ? { ...invoiceResult.data, credit_applied: (invoiceResult.data as any).credit_applied ?? 0 } : null
  const invoiceErr = invoiceResult.error

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

  const [distributorBusinessProfile, vendorBusinessProfile] = await Promise.all([
    getMyBusinessProfile(),
    getVendorBusinessProfileForInvoice(invoice.vendor_id, { distributorId, invoiceId: id })
  ])

  const [orderCreditResult, vendorLedgerResult] = await Promise.all([
    supabase
      .from('order_credit_applications')
      .select('applied_amount')
      .eq('order_id', invoice.order_id)
      .eq('distributor_id', distributorId)
      .eq('vendor_id', invoice.vendor_id)
      .maybeSingle(),
    supabase
      .from('vendor_credit_ledger')
      .select('type,amount')
      .eq('distributor_id', distributorId)
      .eq('vendor_id', invoice.vendor_id),
  ])

  const profit = (invoice.invoice_items ?? []).reduce((sum: number, it: any) => {
    // We still use unit_price and unit_cost for profit estimation
    // But we favor unit_price_snapshot if available
    const effectivePrice = Number(it.unit_price_snapshot ?? it.unit_price ?? 0)
    const effectiveCost = Number(it.unit_cost ?? 0)
    const isCase = (it.order_mode || it.order_unit) === 'case'

    // Total pieces for profit calculation
    const totalPieces = Number(it.total_pieces ?? (isCase ? (it.cases_qty * it.units_per_case_snapshot) : it.pieces_qty) ?? it.qty ?? 0)

    return sum + (effectivePrice - effectiveCost) * totalPieces
  }, 0)
  const creditFeatureUnavailable = (
    (orderCreditResult.error && orderCreditResult.error.code === '42P01')
    || (vendorLedgerResult.error && vendorLedgerResult.error.code === '42P01')
  )
  const creditApplied = Number((orderCreditResult.data as any)?.applied_amount ?? (invoice as any).credit_applied ?? 0)
  const availableCreditBalance = computeVendorCreditBalance(
    ((vendorLedgerResult.error?.code === '42P01') ? [] : (vendorLedgerResult.data ?? [])) as any[]
  )
  const amountDue = computeAmountDue(Number(invoice.total ?? 0), creditApplied)

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
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100/75 shadow-inner">
            <div className="scale-[0.85] origin-top transform-gpu -mb-[15%]">
              {/* Reuse the print layout but inject it inline as a "document view" */}
              <div className="pointer-events-none">
                <InvoicePrint
                  invoice={invoice}
                  vendor={vendorBusinessProfile ?? undefined}
                  distributor={distributorBusinessProfile}
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
                <div className="flex justify-between">
                  <span className="text-slate-600">Credit Applied</span>
                  <span className="font-medium text-emerald-700">-{formatMoney(creditApplied)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold">
                  <span>Amount Due</span>
                  <span>{formatMoney(amountDue)}</span>
                </div>
                <div className="flex justify-between pt-2 text-xs text-emerald-600">
                  <span>Profit (est)</span>
                  <span>{formatMoney(profit)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase text-slate-500">Apply Credit</CardTitle>
            </CardHeader>
            <CardContent>
              {creditFeatureUnavailable ? (
                <p className="text-xs text-amber-700">
                  Credit system is not available yet in this environment. Apply the latest migration to enable it.
                </p>
              ) : (
                <OrderCreditApplyCard
                  vendorId={invoice.vendor_id}
                  orderId={invoice.order_id}
                  availableBalance={availableCreditBalance}
                  currentApplied={creditApplied}
                  orderTotal={Number(invoice.total ?? 0)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
