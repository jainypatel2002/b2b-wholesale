import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/data'

export const dynamic = 'force-dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'

type FilterStatus = 'all' | 'paid' | 'unpaid'

function normalizeStatus(input: string | undefined): FilterStatus {
  if (input === 'paid') return 'paid'
  if (input === 'unpaid') return 'unpaid'
  return 'all'
}

function normalizeDate(input: string | undefined): string | null {
  const value = String(input || '').trim()
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

export default async function VendorInvoicesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; distributor?: string }>
}) {
  const { vendorId } = await getVendorContext()
  const supabase = await createClient()
  const { status: statusParam, from: fromParam, to: toParam, distributor: distributorParam } = await searchParams

  const statusFilter = normalizeStatus(statusParam)
  const fromDate = normalizeDate(fromParam)
  const toDate = normalizeDate(toParam)

  const { data: links } = await supabase
    .from('distributor_vendors')
    .select('distributor_id, distributor:profiles!distributor_id(display_name,email)')
    .eq('vendor_id', vendorId)

  const linkedDistributors = (links ?? [])
    .map((row: any) => ({
      id: String(row.distributor_id),
      name: row.distributor?.display_name || row.distributor?.email || 'Unknown'
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  const linkedDistributorIds = new Set(linkedDistributors.map((d: any) => d.id))
  const distributorFilter = distributorParam && linkedDistributorIds.has(distributorParam) ? distributorParam : ''

  const fromIso = fromDate ? `${fromDate}T00:00:00.000Z` : null
  const toIso = toDate ? `${toDate}T23:59:59.999Z` : null

  let invoicesQuery = supabase
    .from('invoices')
    .select('id,invoice_number,total,payment_status,created_at,distributor_id,distributor:profiles!invoices_distributor_id_fkey(display_name,email)')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })

  if (statusFilter !== 'all') invoicesQuery = invoicesQuery.eq('payment_status', statusFilter)
  if (distributorFilter) invoicesQuery = invoicesQuery.eq('distributor_id', distributorFilter)
  if (fromIso) invoicesQuery = invoicesQuery.gte('created_at', fromIso)
  if (toIso) invoicesQuery = invoicesQuery.lte('created_at', toIso)

  let invoicesResult = await invoicesQuery.is('deleted_at', null)

  if (invoicesResult.error && invoicesResult.error.code === '42703') {
    let fallback = supabase
      .from('invoices')
      .select('id,invoice_number,total,payment_status,created_at,distributor_id,distributor:profiles!invoices_distributor_id_fkey(display_name,email)')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') fallback = fallback.eq('payment_status', statusFilter)
    if (distributorFilter) fallback = fallback.eq('distributor_id', distributorFilter)
    if (fromIso) fallback = fallback.gte('created_at', fromIso)
    if (toIso) fallback = fallback.lte('created_at', toIso)

    invoicesResult = await fallback
  }

  const invoices = invoicesResult.data ?? []

  function buildQuery(overrides: Record<string, string>) {
    const next = new URLSearchParams()
    const merged = {
      status: statusFilter,
      from: fromDate || '',
      to: toDate || '',
      distributor: distributorFilter,
      ...overrides
    }

    if (merged.status && merged.status !== 'all') next.set('status', merged.status)
    if (merged.from) next.set('from', merged.from)
    if (merged.to) next.set('to', merged.to)
    if (merged.distributor) next.set('distributor', merged.distributor)

    const qs = next.toString()
    return qs ? `/vendor/invoices?${qs}` : '/vendor/invoices'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <Link href="/vendor">
          <Button variant="ghost" size="sm" className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-4">
          <form action="/vendor/invoices" className="grid gap-3 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Status</label>
              <select name="status" defaultValue={statusFilter} className="form-select h-10 w-full">
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
              <input name="from" type="date" defaultValue={fromDate || ''} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
              <input name="to" type="date" defaultValue={toDate || ''} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Distributor</label>
              <select name="distributor" defaultValue={distributorFilter} className="form-select h-10 w-full" disabled={linkedDistributors.length <= 1}>
                <option value="">All distributors</option>
                {linkedDistributors.map((dist: any) => (
                  <option key={dist.id} value={dist.id}>{dist.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" className="h-10">Apply</Button>
              <Link href="/vendor/invoices">
                <Button type="button" variant="outline" className="h-10">Reset</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <details className="md:hidden rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </summary>
        <div className="space-y-3 border-t p-4">
          <form action="/vendor/invoices" className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Status</label>
              <select name="status" defaultValue={statusFilter} className="form-select h-10 w-full">
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
                <input name="from" type="date" defaultValue={fromDate || ''} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
                <input name="to" type="date" defaultValue={toDate || ''} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Distributor</label>
              <select name="distributor" defaultValue={distributorFilter} className="form-select h-10 w-full" disabled={linkedDistributors.length <= 1}>
                <option value="">All distributors</option>
                {linkedDistributors.map((dist: any) => (
                  <option key={dist.id} value={dist.id}>{dist.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Apply</Button>
              <Link href={buildQuery({ status: 'all', from: '', to: '', distributor: '' })} className="flex-1">
                <Button type="button" variant="outline" className="w-full">Reset</Button>
              </Link>
            </div>
          </form>
        </div>
      </details>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Distributor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length ? (
                invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <Link href={`/vendor/invoices/${inv.id}`} className="text-primary hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {inv.distributor?.display_name || inv.distributor?.email || <span className="text-slate-400">Unknown</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={inv.payment_status} type="payment" /></TableCell>
                    <TableCell>${Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">No invoices match these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="md:hidden space-y-4">
        {invoices.length ? (
          invoices.map((inv: any) => (
            <Card key={inv.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <Link href={`/vendor/invoices/${inv.id}`} className="mb-1 block font-mono font-bold text-primary hover:underline">
                      {inv.invoice_number}
                    </Link>
                    <StatusBadge status={inv.payment_status} type="payment" />
                    <div className="text-sm font-medium text-slate-900 mt-2">
                      {inv.distributor?.display_name || inv.distributor?.email || 'Unknown'}
                    </div>
                    <div className="text-xs text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold block">${Number(inv.total).toFixed(2)}</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <Link href={`/vendor/invoices/${inv.id}`}>
                    <Button variant="outline" className="w-full">View Details</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-12 text-center text-slate-500">
            No invoices match these filters.
          </div>
        )}
      </div>
    </div>
  )
}

