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

const PAGE_SIZE = 50

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
  searchParams: Promise<{ archived?: string; vendor?: string; page?: string }>
}) {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { archived, vendor: vendorFilter, page: pageParam } = await searchParams
  const showArchived = archived === 'true'
  const currentPage = Math.max(1, parseInt(pageParam || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // ── Build invoices query ──
  let invoicesQuery = supabase
    .from('invoices')
    .select('id,invoice_number,total,payment_status,created_at,deleted_at,vendor:profiles!invoices_vendor_id_fkey(display_name,email)', { count: 'exact' })
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (!showArchived) {
    invoicesQuery = invoicesQuery.is('deleted_at', null)
  }
  if (vendorFilter) {
    invoicesQuery = invoicesQuery.eq('vendor_id', vendorFilter)
  }

  // ── Parallel fetch: vendors + invoices ──
  const [vendors, invoicesResult] = await Promise.all([
    getLinkedVendors(distributorId),
    invoicesQuery,
  ])

  let invoices: any[] | null = invoicesResult.data
  let totalCount = invoicesResult.count ?? 0

  if (invoicesResult.error && invoicesResult.error.code === '42703') {
    console.warn('[DistributorInvoicesPage] deleted_at column missing, retrying without filter')
    let fallbackQuery = supabase
      .from('invoices')
      .select('id,invoice_number,total,payment_status,created_at,vendor:profiles!invoices_vendor_id_fkey(display_name,email)', { count: 'exact' })
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (vendorFilter) {
      fallbackQuery = fallbackQuery.eq('vendor_id', vendorFilter)
    }

    const fallbackResult = await fallbackQuery
    invoices = fallbackResult.data
    totalCount = fallbackResult.count ?? 0
  } else if (invoicesResult.error) {
    console.error('[DistributorInvoicesPage] Error fetching invoices (JSON):', JSON.stringify(invoicesResult.error, null, 2))
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function pageUrl(page: number) {
    const params = new URLSearchParams()
    if (showArchived) params.set('archived', 'true')
    if (vendorFilter) params.set('vendor', vendorFilter)
    if (page > 1) params.set('page', String(page))
    const qs = params.toString()
    return `/distributor/invoices${qs ? `?${qs}` : ''}`
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

      {/* Desktop Table */}
      <Card className="hidden md:block">
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

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {invoices?.length ? (
          invoices.map((inv: any) => {
            const isArchived = !!inv.deleted_at
            return (
              <Card key={inv.id} className={isArchived ? "bg-slate-50 opacity-70" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-blue-600">{inv.invoice_number}</span>
                        <StatusBadge status={inv.payment_status} type="payment" />
                      </div>
                      <div className="text-sm font-medium text-slate-900">{inv.vendor?.display_name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <span className="block text-lg font-bold">${Number(inv.total).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex gap-2">
                    <Link href={`/distributor/invoices/${inv.id}`} className="flex-1">
                      <Button variant="outline" className="w-full">View</Button>
                    </Link>
                    {inv.payment_status === 'paid' ? (
                      <form action={markUnpaid} className="flex-1">
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <Button variant="ghost" type="submit" className="w-full text-orange-600 bg-orange-50 border border-orange-100">
                          Mark Unpaid
                        </Button>
                      </form>
                    ) : (
                      <form action={markPaid} className="flex-1">
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <Button variant="ghost" type="submit" className="w-full text-green-600 bg-green-50 border border-green-100">
                          Mark Paid
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            No invoices found.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            Page {currentPage} of {totalPages} ({totalCount} invoices)
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link href={pageUrl(currentPage - 1)}>
                <Button variant="outline" size="sm">← Previous</Button>
              </Link>
            )}
            {currentPage < totalPages && (
              <Link href={pageUrl(currentPage + 1)}>
                <Button variant="outline" size="sm">Next →</Button>
              </Link>
            )}
          </div>
        </div>
      )}
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
