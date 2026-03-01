import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Layers, ShoppingCart, FileText, BadgeDollarSign, Tag, Wallet } from 'lucide-react'

export default async function DistributorHome() {
  const profile = await requireRole('distributor')

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
      href: '/distributor/credits',
      label: 'Amount Due',
      description: 'Track receivables and unpaid order balances.',
      icon: Wallet,
      color: 'text-violet-700 bg-violet-100'
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
