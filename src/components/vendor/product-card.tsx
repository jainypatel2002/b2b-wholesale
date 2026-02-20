'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export function ProductCard({ product: p, distributorId }: { product: any, distributorId: string }) {
    // Determine default unit: Piece if allowed, else Case
    const [unit, setUnit] = useState<'piece' | 'case'>(p.allow_piece ? 'piece' : 'case')

    // Only show toggle if both are allowed
    const showToggle = p.allow_piece && p.allow_case

    function addToCart() {
        if (!distributorId) {
            alert("No distributor context found. Please refresh.")
            return
        }
        const key = `dv_cart_${distributorId}`
        const raw = localStorage.getItem(key)
        const cart = raw ? JSON.parse(raw) : { items: [] as any[] }

        const existingIdx = cart.items.findIndex((i: any) => i.product_id === p.id && i.order_unit === unit)

        if (existingIdx >= 0) {
            cart.items[existingIdx].qty += 1
        } else {
            cart.items.push({
                product_id: p.id,
                name: p.name,
                unit_price: p.sell_price,
                qty: 1,
                order_unit: unit,
                units_per_case: p.units_per_case,
                distributor_id: distributorId // Store context just in case
            })
        }

        localStorage.setItem(key, JSON.stringify(cart))
        // Simple visual feedback
        const unitLabel = unit === 'case' ? 'Case' : 'Unit'
        alert(`Added ${p.name} (${unitLabel}) to cart`)

        // Dispatch a custom event so the cart badge can update if it listens to it
        window.dispatchEvent(new Event('cart-updated'))
    }

    return (
        <Card className="flex flex-col h-full hover:shadow-md transition-shadow">
            <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start gap-2">
                    <Badge variant="secondary" className="mb-2">
                        {p.categories?.name ?? 'Uncategorized'}
                    </Badge>
                </div>
                <CardTitle className="text-base font-semibold line-clamp-2" title={p.name}>
                    {p.name}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-grow">
                <div className="mt-2 text-2xl font-bold text-slate-900">
                    ${Number(p.sell_price).toFixed(2)}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                    {unit === 'case' ? `per case (${p.units_per_case} units)` : 'per unit'}
                </p>

                {showToggle && (
                    <div className="flex rounded-md shadow-sm" role="group">
                        <button
                            type="button"
                            onClick={() => setUnit('piece')}
                            className={`px-3 py-1 text-xs font-medium border rounded-l-lg ${unit === 'piece'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            Piece
                        </button>
                        <button
                            type="button"
                            onClick={() => setUnit('case')}
                            className={`px-3 py-1 text-xs font-medium border-t border-b border-r rounded-r-lg ${unit === 'case'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            Case
                        </button>
                    </div>
                )}

                {!showToggle && (
                    <Badge variant="outline" className="font-normal">
                        {unit === 'case' ? `Case Only (${p.units_per_case} count)` : 'Piece Only'}
                    </Badge>
                )}
            </CardContent>
            <CardFooter className="p-4 pt-0">
                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={addToCart}>
                    <Plus className="mr-2 h-4 w-4" /> Add {unit === 'case' ? 'Case' : 'Item'}
                </Button>
            </CardFooter>
        </Card>
    )
}
