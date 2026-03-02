import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDistributorContext, getLinkedVendors } from '@/lib/data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Layers, ShoppingCart, FileText, BadgeDollarSign, Tag } from 'lucide-react'
import { ManualAmountDueCard } from '@/components/distributor/manual-amount-due-card'

export default async function DistributorHome() {
  const { distributorId } = await getDistributorContext()
  const supabase = await createClient()
  const vendors = await getLinkedVendors(distributorId)

  const manualDueByVendor: Record<string, { amount: number; updatedAt: string | null }> = {}
  for (const vendor of vendors) {
    manualDueByVendor[vendor.id] = { amount: 0, updatedAt: null }
  }

  if (vendors.length > 0) {
    const vendorIds = vendors.map((vendor) => vendor.id)
    const manualDueResult = await supabase
      .from('distributor_vendors')
      .select('vendor_id,manual_amount_due,manual_amount_due_updated_at')
      .eq('distributor_id', distributorId)
      .in('vendor_id', vendorIds)

    if (!manualDueResult.error) {
      for (const row of manualDueResult.data ?? []) {
        const vendorId = String((row as any).vendor_id || '')
        if (!vendorId || !manualDueByVendor[vendorId]) continue
        manualDueByVendor[vendorId] = {
          amount: Number((row as any).manual_amount_due ?? 0),
          updatedAt: (row as any).manual_amount_due_updated_at
            ? String((row as any).manual_amount_due_updated_at)
            : null,
        }
      }
    } else if (manualDueResult.error.code !== '42703') {
      console.error('[DistributorHome] Failed to load manual amount due rows:', manualDueResult.error)
    }
  }

  const cards = [
    {
      href: '/distributor/categories',
      label: 'Categories',
      description: 'Manage product categories.',
      icon: Layers,
      color: 'text-sky-700 bg-sky-100'
    },
    {
      href: '/distributor/inventory',
      label: 'Inventory',
      description: 'Manage products and stock.',
      icon: Package,
      color: 'text-indigo-700 bg-indigo-100'
    },
    {
      href: '/distributor/orders',
      label: 'Orders',
      description: 'View and fulfill orders.',
      icon: ShoppingCart,
      color: 'text-amber-700 bg-amber-100'
    },
    {
      href: '/distributor/invoices',
      label: 'Invoices',
      description: 'Manage payments and billing.',
      icon: FileText,
      color: 'text-emerald-700 bg-emerald-100'
    },
    {
      href: '/distributor/analytics/profit',
      label: 'Profit Center',
      description: 'Track revenue and margins.',
      icon: BadgeDollarSign,
      color: 'text-teal-700 bg-teal-100'
    },
    {
      href: '/distributor/vendor-pricing',
      label: 'Vendor Pricing',
      description: 'Manage client-specific price overrides and bulk changes.',
      icon: Tag,
      color: 'text-cyan-700 bg-cyan-100'
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
      </div>

      <ManualAmountDueCard
        vendors={vendors}
        initialSelectedVendorId={vendors[0]?.id ?? null}
        manualDueByVendor={manualDueByVendor}
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.href} href={card.href}>
              <Card className="group h-full border-white/75 bg-white/80">
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className={`rounded-xl p-2.5 transition-transform duration-200 group-hover:scale-105 ${card.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">{card.description}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
