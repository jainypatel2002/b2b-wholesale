'use client'

import React from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronsUpDown, Check, Plus } from "lucide-react"
import { switchDistributor } from '@/app/(protected)/vendor/actions'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface DistributorSwitcherProps {
    currentDistributorId: string | null
    linkedDistributors: Array<{ id: string; name: string }>
}

export function DistributorSwitcher({ currentDistributorId, linkedDistributors }: DistributorSwitcherProps) {
    const router = useRouter()
    const currentDistributor = linkedDistributors.find(d => d.id === currentDistributorId)

    async function handleSwitch(distributorId: string) {
        if (distributorId === currentDistributorId) return
        try {
            const result = await switchDistributor(distributorId)
            if (result.success) {
                router.refresh()
            } else {
                toast.error(result.message || "Failed to switch distributor")
                if (result.code === 'NOT_LINKED') {
                    // Optional: redirect to connect page or just show error
                }
            }
        } catch (error) {
            console.error('Failed to switch', error)
            toast.error("An unexpected error occurred")
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" role="combobox" className="w-[200px] justify-between">
                    {currentDistributor?.name || "Select Distributor"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px]">
                <DropdownMenuLabel>My Distributors</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {linkedDistributors.map((distributor) => (
                    <DropdownMenuItem
                        key={distributor.id}
                        onSelect={() => handleSwitch(distributor.id)}
                    >
                        <Check
                            className={`mr-2 h-4 w-4 ${currentDistributorId === distributor.id ? "opacity-100" : "opacity-0"
                                }`}
                        />
                        {distributor.name}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/vendor/settings/connect')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Connect New
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
