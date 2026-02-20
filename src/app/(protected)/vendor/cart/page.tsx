
import { getVendorContext } from '@/lib/data'
import { CartClient } from './cart-client'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function VendorCartPage() {
  const { distributorId } = await getVendorContext({ strict: false })

  if (!distributorId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
        <div className="rounded-full bg-slate-100 p-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">Not Linked to a Distributor</h2>
        <div className="mt-6">
          <Link href="/vendor/settings/connect">
            <Button>Connect Now</Button>
          </Link>
        </div>
      </div>
    )
  }

  return <CartClient distributorId={distributorId} />
}
