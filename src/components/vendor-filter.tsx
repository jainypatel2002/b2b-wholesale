
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface VendorOption {
    id: string
    name: string
}

interface VendorFilterProps {
    vendors: VendorOption[]
}

export function VendorFilter({ vendors }: VendorFilterProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const currentVendor = searchParams.get('vendor') || 'all'

    const handleValueChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value
        const params = new URLSearchParams(searchParams)

        if (value === 'all') {
            params.delete('vendor')
        } else {
            params.set('vendor', value)
        }

        router.push(`${pathname}?${params.toString()}`)
    }

    if (vendors.length === 0) return null

    return (
        <div className="relative">
            <select
                value={currentVendor}
                onChange={handleValueChange}
                className="h-9 w-full min-w-[180px] rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <option value="all">All Vendors</option>
                {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                    </option>
                ))}
            </select>
        </div>
    )
}
