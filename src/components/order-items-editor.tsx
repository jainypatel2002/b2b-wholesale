'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, Undo2, Save, X, Lock } from 'lucide-react'
import { updateOrderItemsAction } from '@/app/actions/distributor'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
    edited_at: string | null
    edited_by: string | null
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
    invoiceExists: boolean
}

export function OrderItemsEditor({ orderId, items, invoiceExists }: OrderItemsEditorProps) {
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

    // Compute live total from edit state
    const liveTotal = useMemo(() => {
        if (!editing) {
            return items.reduce((sum, it) => {
                if (it.removed) return sum
                const price = it.edited_unit_price ?? it.unit_price
                const qty = it.edited_qty ?? it.qty
                return sum + Number(price) * Number(qty)
            }, 0)
        }
        return Object.values(editState).reduce((sum, s) => {
            if (s.removed) return sum
            const price = parseFloat(s.unit_price) || 0
            const qty = parseFloat(s.qty) || 0
            return sum + price * qty
        }, 0)
    }, [editing, items, editState])

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
                        <Button size="sm" onClick={handleSave} disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
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
                                const isRemoved = editing ? s?.removed : item.removed
                                const effectiveName = editing ? s?.name : getEffectiveName(item)
                                const effectivePrice = editing ? parseFloat(s?.unit_price || '0') : Number(item.edited_unit_price ?? item.unit_price)
                                const effectiveQty = editing ? parseFloat(s?.qty || '0') : Number(item.edited_qty ?? item.qty)
                                const lineTotal = effectivePrice * effectiveQty
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
                                                    <span className="font-medium">{effectiveName}</span>
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
                                                <span>{effectiveQty}</span>
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
                                                <span>${effectivePrice.toFixed(2)}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {isRemoved ? '—' : `$${lineTotal.toFixed(2)}`}
                                        </TableCell>
                                        {editing && (
                                            <TableCell className="text-center">
                                                {isRemoved ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => updateField(item.id, 'removed', false)}
                                                        className="h-7 px-2 text-blue-600 hover:text-blue-700"
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
                                <TableCell className="text-right font-bold">${liveTotal.toFixed(2)}</TableCell>
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
                                            className="text-blue-600 h-8"
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
                                            {effectiveQty} × ${effectivePrice.toFixed(2)}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
                <Card>
                    <CardContent className="p-4 flex justify-between items-center bg-slate-50 font-bold">
                        <span>Subtotal</span>
                        <span>${liveTotal.toFixed(2)}</span>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
