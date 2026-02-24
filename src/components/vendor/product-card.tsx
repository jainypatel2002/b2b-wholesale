'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Star } from 'lucide-react'
import { getEffectivePrice, formatPriceLabel } from '@/lib/pricing-engine'
import { computeEquivalentCase, computeEquivalentUnit } from '@/lib/pricing/getEffectivePrice'

type ProductCardProps = {
    product: any
    distributorId: string
    isFavorite?: boolean
    favoriteBusy?: boolean
    onToggleFavorite?: (productId: string) => void
}

export function ProductCard({
    product: p,
    distributorId,
    isFavorite = false,
    favoriteBusy = false,
    onToggleFavorite
}: ProductCardProps) {
    // Determine default unit: Piece if allowed, else Case
    const [unit, setUnit] = useState<'piece' | 'case'>(p.allow_piece ? 'piece' : 'case')

    // Only show toggle if both are allowed
    const showToggle = p.allow_piece && p.allow_case

    // Resolve the active prices using the centralized helper
    const piecePrice = getEffectivePrice(p, 'piece')
    const casePrice = getEffectivePrice(p, 'case')
    const unitsPerCase = Number(p.units_per_case ?? 1)
    const equivalentUnit = casePrice !== null ? computeEquivalentUnit(casePrice, unitsPerCase) : null
    const equivalentCase = piecePrice !== null ? computeEquivalentCase(piecePrice, unitsPerCase) : null

    // Determine the current price based on the mode
    const currentPrice = unit === 'case' ? casePrice : piecePrice

    function addToCart() {
        if (!distributorId) {
            alert("No distributor context found. Please refresh.")
            return
        }

        if (currentPrice === null || currentPrice <= 0) {
            alert(`The price for ${unit === 'case' ? 'Cases' : 'Pieces'} is not available. Please contact your distributor.`)
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
                unit_price: currentPrice, // Now securely stores the TRUE price for the chosen unit
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
        <Card className="flex h-full flex-col border-white/75 bg-white/80 transition-shadow">
            <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start gap-2">
                    <Badge variant="secondary" className="mb-2">
                        {p.categories?.name ?? 'Uncategorized'}
                    </Badge>
                    {onToggleFavorite && (
                        <button
                            type="button"
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${isFavorite
                                ? 'border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100'
                                : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                                }`}
                            onClick={() => onToggleFavorite(p.id)}
                            disabled={favoriteBusy}
                            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                            <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                    )}
                </div>
                <CardTitle className="text-base font-semibold line-clamp-2" title={p.name}>
                    {p.name}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-grow">
                {currentPrice !== null && currentPrice > 0 ? (
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                        {formatPriceLabel(currentPrice, unit)}
                    </div>
                ) : (
                    <div className="mt-2 text-lg font-medium text-red-500">
                        Price Not Available
                    </div>
                )}

                <p className="text-xs text-slate-500 mb-3">
                    {unit === 'case' ? `Pack of ${p.units_per_case ?? 1}` : 'Single unit'}
                    {unit === 'case' && equivalentUnit !== null && casePrice !== null && casePrice > 0 && (
                        <span className="block mt-0.5 opacity-80">
                            (${equivalentUnit.toFixed(2)} / item eq.)
                        </span>
                    )}
                </p>

                <div className="mb-3 text-xs text-slate-500 space-y-1">
                    {p.allow_piece && (
                        <div>
                            {piecePrice !== null && piecePrice > 0
                                ? `$${piecePrice.toFixed(2)} / unit`
                                : 'Set unit price in inventory'}
                        </div>
                    )}
                    {p.allow_case && (
                        <div>
                            {casePrice !== null && casePrice > 0
                                ? `$${casePrice.toFixed(2)} / case`
                                : 'Set case price in inventory'}
                            {casePrice === null && equivalentCase !== null && equivalentCase > 0 && (
                                <span className="ml-1 opacity-80">(${equivalentCase.toFixed(2)} / case eq.)</span>
                            )}
                        </div>
                    )}
                </div>

                {showToggle && (
                    <div className="flex rounded-md shadow-sm" role="group">
                        <button
                            type="button"
                            onClick={() => setUnit('piece')}
                            className={`px-3 py-1 text-xs font-medium border rounded-l-lg ${unit === 'piece'
                                ? 'brand-gradient border-transparent text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            Piece
                        </button>
                        <button
                            type="button"
                            onClick={() => setUnit('case')}
                            className={`px-3 py-1 text-xs font-medium border-t border-b border-r rounded-r-lg ${unit === 'case'
                                ? 'brand-gradient border-transparent text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            Case
                        </button>
                    </div>
                )}

                {!showToggle && (
                    <Badge variant="outline" className="font-normal mt-2">
                        {unit === 'case' ? `Case Only (${p.units_per_case} count)` : 'Piece Only'}
                    </Badge>
                )}
            </CardContent>
            <CardFooter className="p-4 pt-0">
                <Button
                    className="w-full"
                    onClick={addToCart}
                    disabled={currentPrice === null || currentPrice <= 0}
                >
                    <Plus className="mr-2 h-4 w-4" /> Add {unit === 'case' ? 'Case' : 'Item'}
                </Button>
            </CardFooter>
        </Card>
    )
}
