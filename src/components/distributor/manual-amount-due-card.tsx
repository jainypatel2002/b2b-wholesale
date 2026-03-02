'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveManualAmountDueAction } from '@/app/actions/manual-amount-due'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type VendorOption = {
    id: string
    name: string
}

type ManualDueMap = Record<string, { amount: number; updatedAt: string | null }>

interface ManualAmountDueCardProps {
    vendors: VendorOption[]
    initialSelectedVendorId: string | null
    manualDueByVendor: ManualDueMap
}

const MONEY_INPUT_REGEX = /^(?:\d+)(?:\.\d{0,2})?$/

function formatAmountForInput(value: number): string {
    if (!Number.isFinite(value)) return '0'
    return value.toFixed(2)
}

export function ManualAmountDueCard({
    vendors,
    initialSelectedVendorId,
    manualDueByVendor,
}: ManualAmountDueCardProps) {
    const [selectedVendorId, setSelectedVendorId] = useState<string>(initialSelectedVendorId || vendors[0]?.id || '')
    const [balances, setBalances] = useState<ManualDueMap>(manualDueByVendor)
    const selectedBalance = useMemo(() => {
        return balances[selectedVendorId] || { amount: 0, updatedAt: null }
    }, [balances, selectedVendorId])
    const [amountInput, setAmountInput] = useState<string>(formatAmountForInput(selectedBalance.amount))
    const [inputError, setInputError] = useState<string | null>(null)
    const [isSaving, startSave] = useTransition()

    useEffect(() => {
        setAmountInput(formatAmountForInput(selectedBalance.amount))
        setInputError(null)
    }, [selectedBalance.amount, selectedVendorId])

    if (vendors.length === 0) {
        return (
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-base">Manual Amount Due</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-600">No linked vendors found. Link a vendor first.</p>
                </CardContent>
            </Card>
        )
    }

    const handleSave = () => {
        const raw = amountInput.trim()
        if (!raw) {
            setInputError('Amount is required.')
            return
        }
        if (!MONEY_INPUT_REGEX.test(raw)) {
            setInputError('Enter a valid amount with up to 2 decimals.')
            return
        }

        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) {
            setInputError('Enter a valid amount.')
            return
        }
        if (parsed < 0) {
            setInputError('Amount must be 0 or greater.')
            return
        }

        setInputError(null)
        startSave(async () => {
            try {
                const result = await saveManualAmountDueAction({
                    vendorId: selectedVendorId,
                    manualAmountDue: parsed,
                })

                if (!result.success) {
                    toast.error(result.error || 'Failed to save amount due.')
                    return
                }

                const updatedAmount = Number(result.manualAmountDue ?? parsed)
                const updatedAt = result.updatedAt ? String(result.updatedAt) : new Date().toISOString()

                setBalances((prev) => ({
                    ...prev,
                    [selectedVendorId]: {
                        amount: updatedAmount,
                        updatedAt,
                    },
                }))
                setAmountInput(formatAmountForInput(updatedAmount))
                toast.success('Saved')
            } catch (error) {
                console.error('Failed to save manual amount due', error)
                toast.error('Failed to save amount due.')
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Manual Amount Due</CardTitle>
                <p className="text-xs text-slate-500">
                    Dashboard-only manual total. This is not auto-calculated from order history.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-1">
                    <label htmlFor="manual-due-vendor" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Vendor
                    </label>
                    <select
                        id="manual-due-vendor"
                        value={selectedVendorId}
                        onChange={(event) => setSelectedVendorId(event.target.value)}
                        className="form-select"
                        disabled={isSaving}
                    >
                        {vendors.map((vendor) => (
                            <option key={vendor.id} value={vendor.id}>
                                {vendor.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="grid gap-1">
                    <label htmlFor="manual-due-amount" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total Amount Due
                    </label>
                    <Input
                        id="manual-due-amount"
                        value={amountInput}
                        inputMode="decimal"
                        onChange={(event) => setAmountInput(event.target.value)}
                        placeholder="0.00"
                        disabled={isSaving}
                    />
                    {inputError && <p className="text-xs text-red-600">{inputError}</p>}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                        Last updated:{' '}
                        {selectedBalance.updatedAt ? new Date(selectedBalance.updatedAt).toLocaleString() : 'Never'}
                    </p>
                    <Button type="button" onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
