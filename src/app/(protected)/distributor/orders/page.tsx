
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArchiveButton } from '@/components/archive-button'
import { VendorFilter } from '@/components/vendor-filter'

const PAGE_SIZE = 50

export default async function DistributorOrdersPage({
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

  // ── Build orders query ──
  let ordersQuery = supabase
    .from('orders')
    .select('id,status,created_at,deleted_at,vendor_id,created_by_role,vendor:profiles!orders_vendor_id_fkey(display_name,email),order_items(qty,unit_price)', { count: 'exact' })
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (!showArchived) {
    ordersQuery = ordersQuery.is('deleted_at', null)
  }
  if (vendorFilter) {
    ordersQuery = ordersQuery.eq('vendor_id', vendorFilter)
  }

  // ── Parallel fetch: vendors, orders, invoices ──
  const [vendors, ordersResult, { data: invoices }] = await Promise.all([
    getLinkedVendors(distributorId),
    ordersQuery,
    supabase
      .from('invoices')
      .select('id,order_id,payment_status')
      .eq('distributor_id', distributorId),
  ])

  let orders: any[] | null = ordersResult.data
  let totalCount = ordersResult.count ?? 0

  // Fallback for missing column
  if (ordersResult.error && ordersResult.error.code === '42703') {
    let fallbackQuery = supabase
      .from('orders')
      .select('id,status,created_at,vendor_id,vendor:profiles!orders_vendor_id_fkey(display_name,email),order_items(qty,unit_price)', { count: 'exact' })
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (vendorFilter) {
      fallbackQuery = fallbackQuery.eq('vendor_id', vendorFilter)
    }

    const fallbackResult = await fallbackQuery
    orders = fallbackResult.data
    totalCount = fallbackResult.count ?? 0
  } else if (ordersResult.error) {
    console.error('[DistributorOrdersPage] Error fetching orders:', JSON.stringify(ordersResult.error, null, 2))
  }

  const invoiceMap = new Map(invoices?.map((i) => [i.order_id, i]))
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const rows = (orders ?? []).map((o: any) => {
    const total = (o.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
    return {
      ...o,
      total,
      invoice: invoiceMap.get(o.id)
    }
  })

  // Build pagination URL
  function pageUrl(page: number) {
    const params = new URLSearchParams()
    if (showArchived) params.set('archived', 'true')
    if (vendorFilter) params.set('vendor', vendorFilter)
    if (page > 1) params.set('page', String(page))
    const qs = params.toString()
    return `/distributor/orders${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/distributor/orders/create">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              Create Order
            </Button>
          </Link>
          <VendorFilter vendors={vendors} />
          <form>
            <ToggleArchivedButton showArchived={showArchived} />
          </form>
        </div>
      </div>

      {/* Desktop View */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.map((o: any) => {
                  const isFulfilled = o.status === 'fulfilled' || o.status === 'completed'
                  const isPaid = o.invoice?.payment_status === 'paid'
                  const isArchived = !!o.deleted_at
                  const canArchive = isFulfilled && isPaid && !isArchived

                  return (
                    <TableRow key={o.id} className={isArchived ? "bg-slate-50 opacity-70" : ""}>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {o.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{o.vendor?.display_name || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">{o.vendor?.email}</div>
                      </TableCell>
                      <TableCell>
                        {o.created_by_role === 'distributor' ? (
                          <Badge variant="secondary" className="text-xs">Distributor</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Vendor</Badge>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell>
                        {o.invoice ? (
                          <StatusBadge status={o.invoice.payment_status} type="payment" />
                        ) : (
                          <span className="text-slate-400 italic text-xs">No invoice</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">${o.total.toFixed(2)}</TableCell>
                      <TableCell className="text-slate-500">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {isArchived ? (
                          <Badge variant="secondary" className="text-xs">Archived</Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/distributor/orders/${o.id}`}>
                            <Button variant="outline" size="sm">Manage</Button>
                          </Link>
                          {canArchive && (
                            <ArchiveButton id={o.id} type="order" role="distributor" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {rows.length > 0 ? (
          rows.map((o: any) => {
            const isFulfilled = o.status === 'fulfilled' || o.status === 'completed'
            const isPaid = o.invoice?.payment_status === 'paid'
            const isArchived = !!o.deleted_at
            const canArchive = isFulfilled && isPaid && !isArchived

            return (
              <Card key={o.id} className={isArchived ? "bg-slate-50 opacity-70" : ""}>
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                  </div>
                  {isArchived && <Badge variant="secondary" className="text-xs">Archived</Badge>}
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-900">{o.vendor?.display_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{o.vendor?.email}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Created by: {o.created_by_role === 'distributor' ? 'Distributor' : 'Vendor'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">${o.total.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">{new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">Payment:</span>
                    {o.invoice ? (
                      <StatusBadge status={o.invoice.payment_status} type="payment" />
                    ) : (
                      <span className="text-slate-400 italic text-xs">No invoice</span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="p-3 bg-slate-50 border-t border-slate-100 flex gap-2">
                  <Link href={`/distributor/orders/${o.id}`} className="flex-1">
                    <Button variant="outline" className="w-full h-9">Manage</Button>
                  </Link>
                  {canArchive && (
                    <div className="flex-shrink-0">
                      <ArchiveButton id={o.id} type="order" role="distributor" />
                    </div>
                  )}
                </CardFooter>
              </Card>
            )
          })
        ) : (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            No orders found.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            Page {currentPage} of {totalPages} ({totalCount} orders)
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
        redirect(`/distributor/orders?${searchParams.toString()}`)
      }}
    >
      {showArchived ? 'Hide Archived' : 'Show Archived'}
    </Button>
  )
}
