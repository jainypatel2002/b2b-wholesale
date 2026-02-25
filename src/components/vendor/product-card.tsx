'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Star } from 'lucide-react'
import { getEffectivePrice } from '@/lib/pricing-engine'
import { computeEquivalentCase } from '@/lib/pricing/getEffectivePrice'
import { computeUnitPrice, formatMoney } from '@/lib/pricing/display'
import { toast } from 'sonner'
import {
    addProductToVendorCart,
    decrementProductInCart,
    getCartItemQuantity,
    readCartItemsFromStorage,
    writeCartItemsToStorage
} from '@/lib/vendor/cart-storage'
import type { CartStorageItem } from '@/lib/vendor/reorder'

type ProductCardProps = {
    product: any
    distributorId: string
    isFavorite?: boolean
    favoriteBusy?: boolean
    onToggleFavorite?: (productId: string) => void
    quickAddMode?: boolean
    cartItems?: CartStorageItem[]
    onCartItemsChange?: (items: CartStorageItem[]) => void
}

export function ProductCard({
    product: p,
    distributorId,
    isFavorite = false,
    favoriteBusy = false,
    onToggleFavorite,
    quickAddMode = false,
    cartItems = [],
    onCartItemsChange
}: ProductCardProps) {
    // Determine default unit: Piece if allowed, else Case
    const [unit, setUnit] = useState<'piece' | 'case'>(p.allow_piece ? 'piece' : 'case')

    // Only show toggle if both are allowed
    const showToggle = p.allow_piece && p.allow_case

    // Resolve the active prices using the centralized helper
    const piecePrice = getEffectivePrice(p, 'piece')
    const casePrice = getEffectivePrice(p, 'case')
    const unitsPerCase = Number(p.units_per_case ?? 1)
    const equivalentCase = piecePrice !== null ? computeEquivalentCase(piecePrice, unitsPerCase) : null
    const displayUnitPrice = piecePrice ?? (casePrice !== null ? computeUnitPrice(casePrice, unitsPerCase) : null)
    const showCasePrimary = p.allow_case && casePrice !== null && casePrice > 0

    // Determine the current price based on the mode
    const currentPrice = unit === 'case' ? casePrice : piecePrice

    const currentQtyInCart = useMemo(
        () => getCartItemQuantity(cartItems, p.id, unit),
        [cartItems, p.id, unit]
    )

    function addToCart() {
        const result = addProductToVendorCart({
            distributorId,
            product: p,
            requestedUnit: unit,
            qty: 1,
            existingItems: cartItems.length > 0 ? cartItems : undefined
        })
        if (!result.ok) {
            if (result.reason === 'invalid_distributor') {
                toast.error('No distributor context found. Please refresh.')
                return
            }

            if (result.reason === 'unit_not_allowed') {
                toast.error(`${p.name} cannot be ordered by ${unit === 'case' ? 'case' : 'unit'}`)
                return
            }

            if (result.reason === 'price_unavailable') {
                toast.error(`Price for ${unit === 'case' ? 'cases' : 'units'} is not available.`)
                return
            }

            toast.error(`Could not add ${p.name}. Please try again.`)
            return
        }

        onCartItemsChange?.(result.items)

        if (!quickAddMode) {
            toast.success(`Added ${p.name}`)
        }
    }

    function removeOneFromCart() {
        if (!distributorId) return
        const sourceItems = cartItems.length > 0 ? cartItems : readCartItemsFromStorage(distributorId)
        const next = decrementProductInCart(sourceItems, p.id, unit, 1)
        const saved = writeCartItemsToStorage(distributorId, next)
        onCartItemsChange?.(saved)
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
                {showCasePrimary ? (
                    <div className="mt-2">
                        <div className="text-2xl font-bold text-slate-900">
                            {formatMoney(casePrice)}/case
                        </div>
                        {displayUnitPrice !== null && displayUnitPrice > 0 && (
                            <div className="text-xs text-slate-500">
                                {formatMoney(displayUnitPrice)}/unit
                            </div>
                        )}
                    </div>
                ) : displayUnitPrice !== null && displayUnitPrice > 0 ? (
                    <div className="mt-2">
                        <div className="text-2xl font-bold text-slate-900">
                            {formatMoney(displayUnitPrice)}/unit
                        </div>
                        {equivalentCase !== null && equivalentCase > 0 && (
                            <div className="text-xs text-slate-500">
                                {formatMoney(equivalentCase)}/case (derived)
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-2 text-lg font-medium text-red-500">
                        Price Not Available
                    </div>
                )}

                <p className="text-xs text-slate-500 mb-3">
                    {unit === 'case' ? `Ordering by case (${p.units_per_case ?? 1}/case)` : 'Ordering by unit'}
                </p>

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
                {quickAddMode ? (
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2">
                        <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Quick Add
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="h-12 w-12 rounded-lg border border-slate-300 bg-white text-2xl font-bold text-slate-700 disabled:opacity-50"
                                onClick={removeOneFromCart}
                                disabled={currentQtyInCart <= 0}
                                aria-label={`Remove one ${p.name}`}
                            >
                                -
                            </button>
                            <div className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                                <div className="text-xl font-bold text-slate-900">{currentQtyInCart}</div>
                                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{unit}</div>
                            </div>
                            <button
                                type="button"
                                className="h-12 w-12 rounded-lg border border-emerald-300 bg-emerald-50 text-2xl font-bold text-emerald-700 disabled:opacity-50"
                                onClick={addToCart}
                                disabled={currentPrice === null || currentPrice <= 0}
                                aria-label={`Add one ${p.name}`}
                            >
                                +
                            </button>
                        </div>
                    </div>
                ) : (
                    <Button
                        className="w-full"
                        onClick={addToCart}
                        disabled={currentPrice === null || currentPrice <= 0}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Add {unit === 'case' ? 'Case' : 'Item'}
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}
