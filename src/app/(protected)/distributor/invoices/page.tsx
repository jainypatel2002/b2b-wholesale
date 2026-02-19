import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArchiveButton } from '@/components/archive-button'
import { VendorFilter } from '@/components/vendor-filter'

async function markPaid(formData: FormData) {
  'use server'
  const { distributorId } = await getDistributorContext()
  const invoice_id = String(formData.get('invoice_id') || '')
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', invoice_id)
    .eq('distributor_id', distributorId)
  if (error) throw error
}

async function markUnpaid(formData: FormData) {
  'use server'
  const { distributorId } = await getDistributorContext()
  const invoice_id = String(formData.get('invoice_id') || '')
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: 'unpaid', paid_at: null })
    .eq('id', invoice_id)
    .eq('distributor_id', distributorId)
  if (error) throw error
}

export default async function DistributorInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; vendor?: string }>
}) {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { archived, vendor: vendorFilter } = await searchParams
  const showArchived = archived === 'true'

  if (process.env.NODE_ENV === 'development') {
    console.log('[DistributorInvoicesPage] showArchived:', showArchived, 'vendorFilter:', vendorFilter)
  }

  // Fetch vendors for filter
  const vendors = await getLinkedVendors(distributorId)

  let query = supabase
    .from('invoices')
    .select('id,invoice_number,total,payment_status,created_at,deleted_at,vendor:profiles!invoices_vendor_id_fkey(display_name,email)')
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false })

  if (!showArchived) {
    query = query.is('deleted_at', null)
  }

  if (vendorFilter) {
    query = query.eq('vendor_id', vendorFilter) // Assumes foreign key alias is transparent for filtering on column
  }

  let result: any = await query

  if (result.error && result.error.code === '42703') {
    console.warn('[DistributorInvoicesPage] valid deleted_at column missing, retrying without filter')
    let fallbackQuery = supabase
      .from('invoices')
      .select('id,invoice_number,total,payment_status,created_at,vendor:profiles!invoices_vendor_id_fkey(display_name,email)')
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })

    if (vendorFilter) {
      fallbackQuery = fallbackQuery.eq('vendor_id', vendorFilter)
    }

    result = await fallbackQuery
  }

  const { data: invoices, error } = result

  if (error) {
    console.error('[DistributorInvoicesPage] Error fetching invoices (JSON):', JSON.stringify(error, null, 2))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Invoices</h1>
        <div className="flex flex-wrap items-center gap-2">
          <VendorFilter vendors={vendors} />
          <form>
            <ToggleArchivedButton showArchived={showArchived} />
          </form>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead className="text-right">Payment Action</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices?.length ? (
                invoices.map((inv: any) => {
                  const isArchived = !!inv.deleted_at
                  return (
                    <TableRow key={inv.id} className={isArchived ? "bg-slate-50 opacity-70" : ""}>
                      <TableCell className="font-mono text-xs font-medium">
                        <Link href={`/distributor/invoices/${inv.id}`} className="hover:underline text-blue-600">
                          {inv.invoice_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{inv.vendor?.display_name || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">{inv.vendor?.email}</div>
                      </TableCell>
                      <TableCell><StatusBadge status={inv.payment_status} type="payment" /></TableCell>
                      <TableCell className="font-medium">${Number(inv.total).toFixed(2)}</TableCell>
                      <TableCell>
                        {isArchived ? (
                          <Badge variant="secondary" className="text-xs">Archived</Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.payment_status === 'paid' ? (
                          <form action={markUnpaid} className="inline-block">
                            <input type="hidden" name="invoice_id" value={inv.id} />
                            <Button variant="ghost" size="sm" type="submit" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50">
                              Mark Unpaid
                            </Button>
                          </form>
                        ) : (
                          <form action={markPaid} className="inline-block">
                            <input type="hidden" name="invoice_id" value={inv.id} />
                            <Button variant="ghost" size="sm" type="submit" className="text-green-600 hover:text-green-700 hover:bg-green-50">
                              Mark Paid
                            </Button>
                          </form>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/distributor/invoices/${inv.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                          {inv.payment_status === 'paid' && !isArchived && (
                            <ArchiveButton id={inv.id} type="invoice" role="distributor" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">No invoices found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function ToggleArchivedButton({ showArchived }: { showArchived: boolean }) {
  return (
    <Button
      variant="outline"
      size="sm"
      formAction={async () => {
        'use server'
        const { redirect } = await import('next/navigation')
        const searchParams = new URLSearchParams()
        if (!showArchived) searchParams.set('archived', 'true')
        redirect(`/distributor/invoices?${searchParams.toString()}`)
      }}
    >
      {showArchived ? 'Hide Archived' : 'Show Archived'}
    </Button>
  )
}
