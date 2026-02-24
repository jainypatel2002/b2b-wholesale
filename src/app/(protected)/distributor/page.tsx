import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, Layers, ShoppingCart, FileText, BadgeDollarSign, Tag } from 'lucide-react'

export default async function DistributorHome() {
  const profile = await requireRole('distributor')

  const cards = [
    {
      href: '/distributor/categories',
      label: 'Categories',
      description: 'Manage product categories.',
      icon: Layers,
      color: 'text-blue-600 bg-blue-50'
    },
    {
      href: '/distributor/inventory',
      label: 'Inventory',
      description: 'Manage products and stock.',
      icon: Package,
      color: 'text-purple-600 bg-purple-50'
    },
    {
      href: '/distributor/orders',
      label: 'Orders',
      description: 'View and fulfill orders.',
      icon: ShoppingCart,
      color: 'text-orange-600 bg-orange-50'
    },
    {
      href: '/distributor/invoices',
      label: 'Invoices',
      description: 'Manage payments and billing.',
      icon: FileText,
      color: 'text-green-600 bg-green-50'
    },
    {
      href: '/distributor/analytics/profit',
      label: 'Profit Center',
      description: 'Track revenue and margins.',
      icon: BadgeDollarSign,
      color: 'text-emerald-600 bg-emerald-50'
    },
    {
      href: '/distributor/vendor-pricing',
      label: 'Vendor Pricing',
      description: 'Manage client-specific price overrides and bulk changes.',
      icon: Tag,
      color: 'text-indigo-600 bg-indigo-50'
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
              <Card className="h-full transition-all hover:shadow-md hover:border-slate-300">
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className={`p-2 rounded-lg ${card.color}`}>
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
