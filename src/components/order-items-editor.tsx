'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, Undo2, Save, X, Lock, Plus } from 'lucide-react'
import {
    updateOrderItemsAction,
    addOrderAdjustmentAction,
    removeOrderAdjustmentAction,
    addOrderTaxAction,
    removeOrderTaxAction
} from '@/app/actions/distributor'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatQtyLabel, formatPriceLabel, OrderMode, normalizeInvoiceItem, computeInvoiceSubtotal, formatMoney } from '@/lib/pricing-engine'

interface OrderItem {
    id: string
    product_name: string | null
    products?: { name: string } | { name: string }[] | null
    qty: number
    unit_price: number
    unit_cost?: number
    edited_name: string | null
    edited_unit_price: number | null
    edited_qty: number | null
    removed: boolean
    order_unit: OrderMode
    units_per_case_snapshot: number | null
    edited_at: string | null
    edited_by: string | null
}

interface OrderAdjustment {
    id: string
    name: string
    amount: number
}

interface OrderTax {
    id: string
    name: string
    type: 'percent' | 'fixed'
    rate_percent: number
}

interface EditState {
    name: string
    unit_price: string
    qty: string
    removed: boolean
}

interface OrderItemsEditorProps {
    orderId: string
    items: OrderItem[]
    adjustments: OrderAdjustment[]
    taxes: OrderTax[]
    invoiceExists: boolean
}

export function OrderItemsEditor({ orderId, items, adjustments, taxes, invoiceExists }: OrderItemsEditorProps) {
    const [editing, setEditing] = useState(false)
    const [editState, setEditState] = useState<Record<string, EditState>>({})
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    // Initialize edit state from current item values
    function enterEditMode() {
        const state: Record<string, EditState> = {}
        for (const item of items) {
            const effectiveName = item.edited_name ?? item.product_name ?? (Array.isArray(item.products) ? item.products[0]?.name : item.products?.name) ?? ''
            const effectivePrice = item.edited_unit_price ?? item.unit_price
            const effectiveQty = item.edited_qty ?? item.qty
            state[item.id] = {
                name: effectiveName,
                unit_price: String(effectivePrice),
                qty: String(effectiveQty),
                removed: item.removed ?? false,
            }
        }
        setEditState(state)
        setEditing(true)
    }

    function cancelEdit() {
        setEditState({})
        setEditing(false)
    }

    function updateField(itemId: string, field: keyof EditState, value: string | boolean) {
        setEditState(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], [field]: value }
        }))
    }

    // Compute live total from edit state or canonical row values
    const liveTotal = useMemo(() => {
        if (!editing) {
            return computeInvoiceSubtotal(items)
        }

        // When editing, we map the editState back into a shape normalizeInvoiceItem can handle
        const editedItems = items.map(it => {
            const s = editState[it.id]
            if (!s) return it
            return {
                ...it,
                edited_name: s.name,
                edited_unit_price: parseFloat(s.unit_price) || 0,
                edited_qty: parseFloat(s.qty) || 0,
                removed: s.removed
            }
        }).filter(it => !it.removed)

        return computeInvoiceSubtotal(editedItems)
    }, [editing, items, editState])

    // Adjustment State
    const [newAdjName, setNewAdjName] = useState('')
    const [newAdjAmount, setNewAdjAmount] = useState('')

    // Tax State
    const [newTaxName, setNewTaxName] = useState('')
    const [newTaxType, setNewTaxType] = useState<'percent' | 'fixed'>('percent')
    const [newTaxRate, setNewTaxRate] = useState('')

    // ── Live Recalculations ──────────────────────────────────────────
    const finalSubtotal = liveTotal + adjustments.reduce((sum, a) => sum + Number(a.amount), 0)

    // Calculate taxes including existing ones + the one currently being typed (preview)
    const existingTaxes = taxes.reduce((sum, t) => {
        if (t.type === 'percent') return sum + (finalSubtotal * (Number(t.rate_percent) / 100))
        return sum + Number(t.rate_percent)
    }, 0)

    // Draft tax preview (if user is typing a valid rate/amount)
    let draftTax = 0
    const draftRate = parseFloat(newTaxRate)
    if (!isNaN(draftRate) && draftRate > 0) {
        if (newTaxType === 'percent') {
            draftTax = finalSubtotal * (draftRate / 100)
        } else {
            draftTax = draftRate
        }
    }

    const totalTaxes = existingTaxes + draftTax
    const finalTotal = finalSubtotal + totalTaxes

    async function handleAddAdj() {
        if (!newAdjName || !newAdjAmount) return toast.error('Name and Amount required')
        startTransition(async () => {
            const res = await addOrderAdjustmentAction(orderId, newAdjName, Number(newAdjAmount))
            if (res.error) toast.error(res.error)
            else { setNewAdjName(''); setNewAdjAmount('') }
        })
    }

    async function handleRemoveAdj(id: string) {
        startTransition(async () => {
            const res = await removeOrderAdjustmentAction(orderId, id)
            if (res.error) toast.error(res.error)
        })
    }

    async function handleAddTax() {
        if (!newTaxName || !newTaxRate) return toast.error('Name and Rate required')
        startTransition(async () => {
            const res = await addOrderTaxAction(orderId, newTaxName, newTaxType, Number(newTaxRate))
            if (res.error) toast.error(res.error)
            else { setNewTaxName(''); setNewTaxRate('') }
        })
    }

    async function handleRemoveTax(id: string) {
        startTransition(async () => {
            const res = await removeOrderTaxAction(orderId, id)
            if (res.error) toast.error(res.error)
        })
    }

    function handleSave() {
        // Validate
        for (const [id, s] of Object.entries(editState)) {
            if (!s.removed) {
                if (!s.name.trim()) {
                    toast.error('Item name cannot be empty')
                    return
                }
                if (parseFloat(s.unit_price) < 0 || isNaN(parseFloat(s.unit_price))) {
                    toast.error('Price must be a valid non-negative number')
                    return
                }
                if (parseFloat(s.qty) <= 0 || isNaN(parseFloat(s.qty))) {
                    toast.error('Quantity must be greater than zero')
                    return
                }
            }
        }

        // Build update payload — only send items that changed
        const updates = items.map(item => {
            const s = editState[item.id]
            if (!s) return null

            const origName = item.edited_name ?? item.product_name ?? (Array.isArray(item.products) ? item.products[0]?.name : item.products?.name) ?? ''
            const origPrice = item.edited_unit_price ?? item.unit_price
            const origQty = item.edited_qty ?? item.qty
            const origRemoved = item.removed ?? false

            const nameChanged = s.name !== origName
            const priceChanged = parseFloat(s.unit_price) !== Number(origPrice)
            const qtyChanged = parseFloat(s.qty) !== Number(origQty)
            const removedChanged = s.removed !== origRemoved

            if (!nameChanged && !priceChanged && !qtyChanged && !removedChanged) return null

            return {
                order_item_id: item.id,
                edited_name: nameChanged ? s.name : undefined,
                edited_unit_price: priceChanged ? parseFloat(s.unit_price) : undefined,
                edited_qty: qtyChanged ? parseFloat(s.qty) : undefined,
                removed: removedChanged ? s.removed : undefined,
            }
        }).filter(Boolean) as any[]

        if (!updates.length) {
            toast.info('No changes to save')
            setEditing(false)
            return
        }

        startTransition(async () => {
            const res = await updateOrderItemsAction(orderId, updates)
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success('Order updated. Invoice will reflect these changes.')
                setEditing(false)
                router.refresh()
            }
        })
    }

    // Helper to check if an item was edited
    function isItemEdited(item: OrderItem) {
        return item.edited_name !== null || item.edited_unit_price !== null || item.edited_qty !== null
    }

    function getEffectiveName(item: OrderItem) {
        return item.edited_name ?? item.product_name ?? (Array.isArray(item.products) ? item.products[0]?.name : item.products?.name) ?? '(Unknown)'
    }

    return (
        <div className="space-y-4">
            {/* Header with Edit/Lock controls */}
            <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <span>Items</span>
                    <span className="text-sm font-normal text-slate-500">
                        {items.filter(i => !(editing ? editState[i.id]?.removed : i.removed)).length} active items
                    </span>
                </CardTitle>
                {invoiceExists ? (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                        <Lock className="h-3.5 w-3.5" />
                        Invoice generated — order locked
                    </div>
                ) : editing ? (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelEdit} disabled={isPending}>
                            <X className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isPending} className="min-w-[120px]">
                            <Save className="mr-1 h-3.5 w-3.5" /> {isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                ) : (
                    <Button variant="outline" size="sm" onClick={enterEditMode}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit Order
                    </Button>
                )}
            </div>

            {/* Desktop Table */}
            <Card className="hidden md:block">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right w-24">Qty</TableHead>
                                <TableHead className="text-right w-32">Unit Price</TableHead>
                                <TableHead className="text-right w-28">Total</TableHead>
                                {editing && <TableHead className="w-20 text-center">Action</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => {
                                const s = editState[item.id]
                                const normalizedItem = normalizeInvoiceItem({
                                    ...item,
                                    ...(editing ? {
                                        edited_name: s?.name,
                                        edited_unit_price: parseFloat(s?.unit_price || '0'),
                                        edited_qty: parseFloat(s?.qty || '0'),
                                        removed: s?.removed
                                    } : {})
                                })
                                const isRemoved = normalizedItem.isManual ? false : (editing ? s?.removed : item.removed)
                                const lineTotal = normalizedItem.lineTotal
                                const effectivePrice = normalizedItem.mode === 'case' ? normalizedItem.casePrice : normalizedItem.unitPrice
                                const wasEdited = isItemEdited(item)

                                return (
                                    <TableRow key={item.id} className={isRemoved ? 'opacity-40 bg-red-50 line-through' : ''}>
                                        <TableCell>
                                            {editing && !isRemoved ? (
                                                <Input
                                                    value={s?.name ?? ''}
                                                    onChange={e => updateField(item.id, 'name', e.target.value)}
                                                    className="h-8 text-sm"
                                                />
                                            ) : (
                                                <div>
                                                    <span className="font-medium">{normalizedItem.productName}</span>
                                                    {wasEdited && !editing && (
                                                        <Badge variant="secondary" className="ml-2 text-[10px] py-0">Edited</Badge>
                                                    )}
                                                    {wasEdited && !editing && item.edited_name && (
                                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                                            Original: {item.product_name ?? (Array.isArray(item.products) ? item.products[0]?.name : item.products?.name) ?? '—'}
                                                        </div>
                                                    )}
                                                    {isRemoved && !editing && (
                                                        <Badge variant="destructive" className="ml-2 text-[10px] py-0">Removed</Badge>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {editing && !isRemoved ? (
                                                <Input
                                                    type="number"
                                                    step="1"
                                                    min="1"
                                                    value={s?.qty ?? ''}
                                                    onChange={e => updateField(item.id, 'qty', e.target.value)}
                                                    className="h-8 text-sm text-right w-20 ml-auto"
                                                />
                                            ) : (
                                                <>
                                                    <span>{formatQtyLabel(normalizedItem.qty, normalizedItem.mode)}</span>
                                                    {normalizedItem.mode === 'case' && normalizedItem.unitsPerCase > 0 && (
                                                        <div className="text-[10px] text-slate-400">@ {item.units_per_case_snapshot}/case</div>
                                                    )}
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {editing && !isRemoved ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-slate-400">$</span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={s?.unit_price ?? ''}
                                                        onChange={e => updateField(item.id, 'unit_price', e.target.value)}
                                                        className="h-8 text-sm text-right w-24"
                                                    />
                                                </div>
                                            ) : (
                                                <span>{formatPriceLabel(effectivePrice, normalizedItem.mode)}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {isRemoved ? '—' : formatMoney(lineTotal)}
                                        </TableCell>
                                        {editing && (
                                            <TableCell className="text-center">
                                                {isRemoved ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => updateField(item.id, 'removed', false)}
                                                        className="h-7 px-2 text-primary hover:text-primary/80"
                                                    >
                                                        <Undo2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => updateField(item.id, 'removed', true)}
                                                        className="h-7 px-2 text-red-500 hover:text-red-700"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                )
                            })}
                            <TableRow>
                                <TableCell colSpan={editing ? 3 : 3} className="text-right font-bold">
                                    Subtotal
                                </TableCell>
                                <TableCell className="text-right font-bold">{formatMoney(liveTotal)}</TableCell>
                                {editing && <TableCell />}
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Mobile View */}
            <div className="md:hidden space-y-3">
                {items.map(item => {
                    const s = editState[item.id]
                    const isRemoved = editing ? s?.removed : item.removed
                    const effectiveName = editing ? s?.name : getEffectiveName(item)
                    const effectivePrice = editing ? parseFloat(s?.unit_price || '0') : Number(item.edited_unit_price ?? item.unit_price)
                    const effectiveQty = editing ? parseFloat(s?.qty || '0') : Number(item.edited_qty ?? item.qty)
                    const lineTotal = effectivePrice * effectiveQty
                    const wasEdited = isItemEdited(item)

                    return (
                        <Card key={item.id} className={isRemoved ? 'opacity-40 border-red-200' : ''}>
                            <CardContent className="p-4">
                                {editing && !isRemoved ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs text-slate-500 mb-1 block">Name</label>
                                            <Input
                                                value={s?.name ?? ''}
                                                onChange={e => updateField(item.id, 'name', e.target.value)}
                                                className="h-9"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs text-slate-500 mb-1 block">Qty</label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={s?.qty ?? ''}
                                                    onChange={e => updateField(item.id, 'qty', e.target.value)}
                                                    className="h-9"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-500 mb-1 block">Price ($)</label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={s?.unit_price ?? ''}
                                                    onChange={e => updateField(item.id, 'unit_price', e.target.value)}
                                                    className="h-9"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center pt-1">
                                            <span className="text-sm font-bold">${lineTotal.toFixed(2)}</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => updateField(item.id, 'removed', true)}
                                                className="text-red-500 hover:text-red-700 h-8"
                                            >
                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                                            </Button>
                                        </div>
                                    </div>
                                ) : isRemoved && editing ? (
                                    <div className="flex justify-between items-center">
                                        <span className="line-through text-slate-400">{effectiveName}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => updateField(item.id, 'removed', false)}
                                            className="h-8 text-primary hover:text-primary/80"
                                        >
                                            <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
                                        </Button>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <span className="font-medium text-slate-900">{effectiveName}</span>
                                                {wasEdited && <Badge variant="secondary" className="ml-2 text-[10px] py-0">Edited</Badge>}
                                                {isRemoved && <Badge variant="destructive" className="ml-2 text-[10px] py-0">Removed</Badge>}
                                            </div>
                                            <span className="font-bold">{isRemoved ? '—' : `$${lineTotal.toFixed(2)}`}</span>
                                        </div>
                                        <div className="text-sm text-slate-500">
                                            {formatQtyLabel(effectiveQty, item.order_unit)} × {formatPriceLabel(effectivePrice, item.order_unit)}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Adjustments & Taxes Section */}
            <div className="grid md:grid-cols-2 gap-4 mt-6">

                {/* Manual Lines / Adjustments */}
                <Card>
                    <CardHeader className="py-3 px-4 bg-slate-50 border-b">
                        <CardTitle className="text-sm font-semibold">Fees / Adjustments</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        {adjustments.map(adj => (
                            <div key={adj.id} className="flex justify-between items-center text-sm">
                                <span>{adj.name}</span>
                                <div className="flex items-center gap-3">
                                    <span className="font-medium">${Number(adj.amount).toFixed(2)}</span>
                                    {!invoiceExists && (
                                        <Button variant="ghost" size="sm" onClick={() => handleRemoveAdj(adj.id)} disabled={isPending} className="h-6 w-6 p-0 text-red-500">
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {!invoiceExists && (
                            <div className="relative z-10 mt-2 border-t pt-3">
                                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_auto] sm:items-end lg:grid-cols-[1.2fr_1fr_auto] lg:gap-4">
                                    <div className="min-w-0 lg:min-w-0">
                                        <label htmlFor="new-adjustment-name" className="mb-1 block text-xs font-medium text-slate-600 lg:mb-2 lg:whitespace-nowrap lg:leading-normal">
                                            Fee Name
                                        </label>
                                        <Input
                                            id="new-adjustment-name"
                                            placeholder="Shipping, Fee..."
                                            value={newAdjName}
                                            onChange={e => setNewAdjName(e.target.value)}
                                            className="h-11 w-full text-base sm:h-10 sm:text-sm lg:h-11"
                                        />
                                    </div>
                                    <div className="min-w-0 lg:min-w-0">
                                        <label htmlFor="new-adjustment-amount" className="mb-1 block text-xs font-medium text-slate-600 lg:mb-2 lg:whitespace-nowrap lg:leading-normal">
                                            Amount
                                        </label>
                                        <Input
                                            id="new-adjustment-amount"
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            placeholder="Amount"
                                            value={newAdjAmount}
                                            onChange={e => setNewAdjAmount(e.target.value)}
                                            className="h-11 w-full text-base sm:h-10 sm:text-sm lg:h-11"
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={handleAddAdj}
                                        disabled={isPending}
                                        className="h-11 w-full shrink-0 px-3 sm:h-10 sm:w-11 sm:px-0 lg:h-11 lg:w-11"
                                        aria-label="Add adjustment"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Taxes */}
                <Card>
                    <CardHeader className="py-3 px-4 bg-slate-50 border-b">
                        <CardTitle className="text-sm font-semibold">Taxes</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                        {taxes.map(tax => (
                            <div key={tax.id} className="flex justify-between items-center text-sm">
                                <span>{tax.name} {tax.type === 'percent' && `(${tax.rate_percent}%)`}</span>
                                <div className="flex items-center gap-3">
                                    <span className="font-medium">
                                        {tax.type === 'percent'
                                            ? `$${(finalSubtotal * (Number(tax.rate_percent) / 100)).toFixed(2)}`
                                            : `$${Number(tax.rate_percent).toFixed(2)}`}
                                    </span>
                                    {!invoiceExists && (
                                        <Button variant="ghost" size="sm" onClick={() => handleRemoveTax(tax.id)} disabled={isPending} className="h-6 w-6 p-0 text-red-500">
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {!invoiceExists && (
                            <div className="relative z-10 mt-2 border-t pt-3">
                                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)_auto] sm:items-end lg:grid-cols-[1.2fr_0.8fr_0.8fr_auto] lg:gap-4">
                                    <div className="min-w-0 lg:min-w-0">
                                        <label htmlFor="new-tax-name" className="mb-1 block text-xs font-medium text-slate-600 lg:mb-2 lg:whitespace-nowrap lg:leading-normal">
                                            Tax Name
                                        </label>
                                        <Input
                                            id="new-tax-name"
                                            placeholder="State Tax..."
                                            value={newTaxName}
                                            onChange={e => setNewTaxName(e.target.value)}
                                            className="h-11 w-full text-base sm:h-10 sm:text-sm lg:h-11"
                                        />
                                    </div>
                                    <div className="min-w-0 lg:min-w-0">
                                        <label htmlFor="new-tax-type" className="mb-1 block text-xs font-medium text-slate-600 lg:mb-2 lg:whitespace-nowrap lg:leading-normal">
                                            Type
                                        </label>
                                        <select
                                            id="new-tax-type"
                                            className="form-select h-11 w-full rounded-md px-2 text-base sm:h-10 sm:text-sm lg:h-11"
                                            value={newTaxType}
                                            onChange={e => setNewTaxType(e.target.value as any)}
                                        >
                                            <option value="percent">%</option>
                                            <option value="fixed">$</option>
                                        </select>
                                    </div>
                                    <div className="min-w-0 lg:min-w-0">
                                        <label htmlFor="new-tax-rate" className="mb-1 block text-xs font-medium text-slate-600 lg:mb-2 lg:whitespace-nowrap lg:leading-normal">
                                            {newTaxType === 'percent' ? 'Rate (%)' : 'Amount ($)'}
                                        </label>
                                        <Input
                                            id="new-tax-rate"
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            placeholder="Rate / Amount"
                                            value={newTaxRate}
                                            onChange={e => setNewTaxRate(e.target.value)}
                                            className="h-11 w-full text-base sm:h-10 sm:text-sm lg:h-11"
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={handleAddTax}
                                        disabled={isPending}
                                        className="h-11 w-full shrink-0 px-3 sm:h-10 sm:w-11 sm:px-0 lg:h-11 lg:w-11"
                                        aria-label="Add tax"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Final Totals Table */}
            <Card className="border-t-4 border-t-slate-800">
                <CardContent className="p-4 md:p-6 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Items Subtotal</span>
                        <span>{formatMoney(liveTotal)}</span>
                    </div>
                    {adjustments.length > 0 && (
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">Fees / Adjustments</span>
                            <span>{formatMoney(finalSubtotal - liveTotal)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center font-medium border-t border-slate-100 pt-2 mt-2">
                        <span>Pre-Tax Subtotal</span>
                        <span>{formatMoney(finalSubtotal)}</span>
                    </div>
                    {taxes.length > 0 && (
                        <div className="flex justify-between items-center text-sm text-slate-600">
                            <span>Taxes</span>
                            <span>+{formatMoney(totalTaxes)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center font-bold text-lg border-t border-slate-200 pt-3 mt-3">
                        <span>Preview Total</span>
                        <span>{formatMoney(finalTotal)}</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
