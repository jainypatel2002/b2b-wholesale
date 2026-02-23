/**
 * Pricing Engine
 * 
 * Centralized logic for all price and quantity calculations.
 * Standardizes the handling of Pieces vs Cases.
 */

export type OrderMode = 'piece' | 'case';

export interface ProductPricing {
    sell_per_unit?: number | null;
    cost_per_unit?: number | null;
    sell_per_case?: number | null;
    cost_per_case?: number | null;
    units_per_case?: number | null;
    allow_piece?: boolean;
    allow_case?: boolean;

    // Legacy support
    sell_price?: number | null;
    price_case?: number | null;
    vendor_price_override?: number | null; // in dollars
}

/**
 * Returns the price to be used for a line item.
 */
export function getEffectivePrice(
    product: ProductPricing,
    mode: OrderMode
): number | null {
    // 1. Base Unit Price (Primary: override, Secondary: canonical, Tertiary: legacy)
    const baseUnitPrice = product.vendor_price_override ?? product.sell_per_unit ?? product.sell_price ?? 0;

    if (mode === 'piece') {
        return baseUnitPrice > 0 ? baseUnitPrice : null;
    }

    if (mode === 'case') {
        // Explicit case price if set and > 0, otherwise derived
        const explicitCasePrice = product.sell_per_case ?? product.price_case ?? 0;
        if (explicitCasePrice > 0) {
            return explicitCasePrice;
        }

        const upc = product.units_per_case ?? 1;
        if (upc > 1 && baseUnitPrice > 0) {
            return baseUnitPrice * upc;
        }
    }

    return null;
}

/**
 * Computes the subtotal for a line item.
 */
export function computeLineTotal(qty: number, price: number): number {
    return Math.round(qty * price * 100) / 100;
}

/**
 * Formats $6.60 -> "$6.60/pc" or "$33.00/case"
 */
export function formatPriceLabel(price: number, mode: OrderMode): string {
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(price);

    return `${formatted}/${mode === 'piece' ? 'pc' : 'case'}`;
}

/**
 * Formats "5 pcs" or "2 cases"
 */
export function formatQtyLabel(qty: number, mode: OrderMode): string {
    if (mode === 'piece') {
        return `${qty} ${qty === 1 ? 'pc' : 'pcs'}`;
    }
    return `${qty} ${qty === 1 ? 'case' : 'cases'}`;
}
