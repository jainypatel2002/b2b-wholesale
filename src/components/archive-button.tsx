
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { archiveOrder, archiveInvoice, archiveProduct } from '@/app/actions/archive'
import { toast } from 'sonner'
import { Loader2, Trash2, Archive } from 'lucide-react'
import { useRouter } from 'next/navigation'

type ArchiveType = 'order' | 'invoice' | 'product'
type Role = 'distributor' | 'vendor'

interface ArchiveButtonProps {
    id: string
    type: ArchiveType
    role: Role
    className?: string
}

export function ArchiveButton({ id, type, role, className }: ArchiveButtonProps) {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleArchive = async () => {
        // Confirm dialog (simple browser confirm for now, can be upgraded to modal)
        if (!confirm('Are you sure you want to archive this item? It will be moved to the archived view.')) {
            return
        }

        setIsLoading(true)
        try {
            let result
            if (type === 'order') {
                result = await archiveOrder(id, role)
            } else if (type === 'invoice') {
                result = await archiveInvoice(id, role)
            } else if (type === 'product') {
                result = await archiveProduct(id)
            }

            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} archived successfully`)
                router.refresh()
            }
        } catch (err) {
            toast.error('An unexpected error occurred')
            console.error(err)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
            disabled={isLoading}
            className={`text-slate-400 hover:text-red-600 hover:bg-red-50 ${className}`}
            title="Archive"
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Archive className="h-4 w-4" />
            )}
            <span className="sr-only">Archive</span>
        </Button>
    )
}
