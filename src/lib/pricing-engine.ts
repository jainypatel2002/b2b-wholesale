/**
 * Pricing Engine
 * 
 * Centralized logic for all price and quantity calculations.
 * Standardizes the handling of Pieces vs Cases.
 */
import {
    getEffectivePrice as resolveEffectivePrice,
    getRequiredEffectivePrice as resolveRequiredEffectivePrice,
    MissingEffectivePriceError
} from '@/lib/pricing/getEffectivePrice'

export type OrderMode = 'piece' | 'case';

export interface ProductPricing {
    sell_per_unit?: number | null;
    sell_per_case?: number | null;
    units_per_case?: number | null;
    allow_piece?: boolean;
    allow_case?: boolean;

    // Legacy or active fallbacks
    sell_price?: number | null;
    price_case?: number | null;
    vendor_price_override?: number | null; // legacy or unit override (dollars)
    override_unit_price?: number | null; // canonical unit override (dollars)
    override_case_price?: number | null; // canonical case override (dollars)
}

/**
 * Returns the effective price to be used for a line item.
 * Guarantees a number or null if completely unpriced.
 * 
 * Hierarchy:
 * 1. Override for requested mode
 * 2. Base price for requested mode
 * 3. Null (no implicit unit/case conversion)
 */
export function getEffectivePrice(
    product: ProductPricing,
    mode: OrderMode
): number | null {
    const { price } = resolveEffectivePrice({
        unitType: mode,
        product: {
            sell_per_unit: product.sell_per_unit,
            sell_per_case: product.sell_per_case,
            sell_price: product.sell_price,
            price_case: product.price_case,
            units_per_case: product.units_per_case
        },
        vendorOverride: {
            price_per_unit: product.override_unit_price ?? product.vendor_price_override,
            price_per_case: product.override_case_price
        }
    })
    return price
}

export function getEffectivePriceOrThrow(
    product: ProductPricing,
    mode: OrderMode
): number {
    const { price } = resolveRequiredEffectivePrice({
        unitType: mode,
        product: {
            sell_per_unit: product.sell_per_unit,
            sell_per_case: product.sell_per_case,
            sell_price: product.sell_price,
            price_case: product.price_case,
            units_per_case: product.units_per_case
        },
        vendorOverride: {
            price_per_unit: product.override_unit_price ?? product.vendor_price_override,
            price_per_case: product.override_case_price
        }
    })

    return price
}

export { MissingEffectivePriceError }

/**
 * Safely computes the line total based strictly on final qty and final resolved price.
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

/**
 * Formats a number as USD currency.
 */
export function formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
}

/**
 * Normalized Invoice Item for display and calculation
 */
export interface NormalizedItem {
    id: string;
    productName: string;
    categoryName: string;
    mode: OrderMode;
    qty: number;
    unitsPerCase: number;
    unitPrice: number;
    casePrice: number;
    lineTotal: number;
    isManual: boolean;
    itemCode?: string | null;
}

/**
 * Normalizes an invoice_item or order_item row into a canonical format.
 * This is the SINGLE SOURCE OF TRUTH for invoice row math.
 */
export function normalizeInvoiceItem(item: any): NormalizedItem {
    const isManual = !!item.is_manual;
    const mode = (item.order_mode || item.order_unit || 'piece') as OrderMode;
    const isCase = mode === 'case';

    // 1. QTY
    const qty = Number(item.quantity_snapshot ?? item.edited_qty ?? (isCase ? item.cases_qty : item.pieces_qty) ?? item.qty ?? 0);

    // 2. Units/Case
    const unitsPerCase = Number(item.units_per_case_snapshot ?? item.units_per_case ?? 1);

    // 3. Line Total - ABSOLUTE SOURCE OF TRUTH
    let storedTotal = -1;
    if (item.line_total_snapshot != null) storedTotal = Number(item.line_total_snapshot);
    else if (item.ext_amount != null) storedTotal = Number(item.ext_amount);

    // 4. Prices - Favor snapshot, then edited, then legacy
    let unitPrice = Number(item.unit_price_snapshot ?? item.edited_unit_price ?? item.unit_price ?? 0);
    // Be careful with casePrice from db, it might be 0.
    let casePrice = Number(item.case_price_snapshot ?? -1);

    // Legacy fallback logic for prices
    if (casePrice < 0) {
        if (isCase) {
            // In legacy, if order_unit was 'case', unit_price column often ALREADY stored the case price.
            if (item.order_unit === 'case') {
                casePrice = unitPrice;
                if (unitPrice > 0 && unitsPerCase > 1) {
                    unitPrice = casePrice / unitsPerCase;
                }
            } else if (unitsPerCase > 1) {
                casePrice = unitPrice * unitsPerCase;
            } else {
                casePrice = unitPrice;
            }
        } else {
            // Piece mode, casePrice derived if not set
            if (unitsPerCase > 1) casePrice = unitPrice * unitsPerCase;
            else casePrice = unitPrice;
        }
    }

    // 5. Final Line Total Calculation
    let lineTotal = storedTotal < 0
        ? computeLineTotal(qty, isCase ? casePrice : unitPrice)
        : storedTotal;

    return {
        id: item.id,
        productName: item.product_name_snapshot || item.product_name || (Array.isArray(item.products) ? item.products[0]?.name : item.products?.name) || 'Unknown Item',
        categoryName: item.category_name_snapshot || item.category_label || item.category_name || '—',
        mode,
        qty,
        unitsPerCase,
        unitPrice,
        casePrice,
        lineTotal: Math.round(lineTotal * 100) / 100,
        isManual,
        itemCode: item.item_code || item.upc
    };
}

/**
 * Computes the subtotal for a set of normalized items.
 */
export function computeInvoiceSubtotal(items: any[]): number {
    const normalized = items.map(normalizeInvoiceItem);
    return normalized.reduce((sum, item) => sum + item.lineTotal, 0);
}
