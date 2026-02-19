
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

export default async function DistributorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; vendor?: string }>
}) {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()

  const { archived, vendor: vendorFilter } = await searchParams
  const showArchived = archived === 'true'

  if (process.env.NODE_ENV === 'development') {
    console.log('[DistributorOrdersPage] showArchived:', showArchived, 'vendorFilter:', vendorFilter)
  }

  // Fetch vendors for filter
  const vendors = await getLinkedVendors(distributorId)

  let query = supabase
    .from('orders')
    .select('id,status,created_at,deleted_at,vendor_id,vendor:profiles!orders_vendor_id_fkey(display_name,email),order_items(qty,unit_price)')
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false })

  if (!showArchived) {
    query = query.is('deleted_at', null)
  }

  if (vendorFilter) {
    query = query.eq('vendor_id', vendorFilter)
  }

  let result: any = await query

  // Fallback for missing column (just in case migration failed)
  if (result.error && result.error.code === '42703') {
    console.warn('[DistributorOrdersPage] deleted_at column missing, retrying basic query')
    let fallbackQuery = supabase
      .from('orders')
      .select('id,status,created_at,vendor_id,vendor:profiles!orders_vendor_id_fkey(display_name,email),order_items(qty,unit_price)')
      .eq('distributor_id', distributorId)
      .order('created_at', { ascending: false })

    if (vendorFilter) {
      fallbackQuery = fallbackQuery.eq('vendor_id', vendorFilter)
    }

    result = await fallbackQuery
  }

  const { data: orders, error: ordersError } = result
  if (ordersError) {
    console.error('[DistributorOrdersPage] Error fetching orders:', JSON.stringify(ordersError, null, 2))
  }

  // Fetch invoices to map payment status
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id,order_id,payment_status')
    .eq('distributor_id', distributorId)

  const invoiceMap = new Map(invoices?.map((i) => [i.order_id, i]))

  const rows = (orders ?? []).map((o: any) => {
    const total = (o.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
    return {
      ...o,
      total,
      invoice: invoiceMap.get(o.id)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
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
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
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
                  <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                    No orders found.
                  </TableCell>
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
        redirect(`/distributor/orders?${searchParams.toString()}`)
      }}
    >
      {showArchived ? 'Hide Archived' : 'Show Archived'}
    </Button>
  )
}

