
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
                className="form-select min-w-[180px]"
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
