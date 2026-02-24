import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArchiveButton } from '@/components/archive-button'
import { ArrowLeft } from 'lucide-react'

const PAGE_SIZE = 50

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()

  const { page: pageParam } = await searchParams
  const currentPage = Math.max(1, parseInt(pageParam || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let result = await supabase
    .from('orders')
    .select('id,status,created_at,order_items(qty,unit_price)', { count: 'exact' })
    .eq('vendor_id', vendorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (result.error && result.error.code === '42703') {
    console.warn('[VendorOrdersPage] valid deleted_at column missing, retrying without filter')
    result = await supabase
      .from('orders')
      .select('id,status,created_at,order_items(qty,unit_price)', { count: 'exact' })
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .range(from, to)
  }

  const { data: orders, error, count: totalCount } = result
  if (error) {
    console.error('[VendorOrdersPage] Error fetching orders:', error)
  }

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE))

  const rows = (orders ?? []).map((o: any) => {
    const total = (o.order_items ?? []).reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.qty), 0)
    return { ...o, total }
  })

  function pageUrl(page: number) {
    if (page <= 1) return '/vendor/orders'
    return `/vendor/orders?page=${page}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Order History</h1>
        <Link href="/vendor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((o: any) => {
                  const canArchive = o.status === 'fulfilled' || o.status === 'completed'

                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        <Link href={`/vendor/orders/${o.id}`} className="text-primary hover:underline">
                          {o.id.slice(0, 8)}...
                        </Link>
                      </TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell>${o.total.toFixed(2)}</TableCell>
                      <TableCell className="text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/vendor/orders/${o.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                          {canArchive && (
                            <ArchiveButton id={o.id} type="order" role="vendor" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">No orders yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {rows.length ? (
          rows.map((o: any) => {
            const canArchive = o.status === 'fulfilled' || o.status === 'completed'
            return (
              <Card key={o.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-mono font-bold text-primary">{o.id.slice(0, 8)}...</h3>
                      <div className="mt-1">
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-2">{new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold block">${o.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex gap-2">
                    <Link href={`/vendor/orders/${o.id}`} className="flex-1">
                      <Button variant="outline" className="w-full">View Details</Button>
                    </Link>
                    {canArchive && (
                      <div className="flex-shrink-0">
                        <ArchiveButton id={o.id} type="order" role="vendor" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-12 text-center text-slate-500">
            No orders yet.
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
