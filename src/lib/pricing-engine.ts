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

    sell_price?: number | null;
    price_case?: number | null;
    vendor_price_override?: number | null; // legacy or unit override (dollars)
    override_unit_price?: number | null; // canonical unit override (dollars)
    override_case_price?: number | null; // canonical case override (dollars)
}

/**
 * Returns the price to be used for a line item.
 */
export function getEffectivePrice(
    product: ProductPricing,
    mode: OrderMode
): number | null {
    // 1. Base Unit Price (Primary: canonical logic, Secondary: legacy)
    const unitOverride = product.override_unit_price ?? product.vendor_price_override ?? null;
    const baseUnitPrice = unitOverride ?? product.sell_per_unit ?? product.sell_price ?? 0;

    if (mode === 'piece') {
        return baseUnitPrice > 0 ? baseUnitPrice : null;
    }

    if (mode === 'case') {
        // 2. Case Price Precedence:
        // A. Explicit Case Override
        if (product.override_case_price && product.override_case_price > 0) {
            return product.override_case_price;
        }

        // B. Explicit Case Base Price (canonical or legacy)
        const explicitCaseBase = product.sell_per_case ?? product.price_case ?? 0;
        if (explicitCaseBase > 0) {
            return explicitCaseBase;
        }

        // C. Derived from Unit Price (with units_per_case)
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

/**
 * Normalized Invoice Item for display and calculation
 */
export interface NormalizedItem {
    id: string;
    productName: string;
    categoryName: string;
    categoryLabel?: string | null;
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

    // 1. QTY - Favor quantity_snapshot, then edited_qty, then base qty
    const qty = Number(item.quantity_snapshot ?? item.edited_qty ?? (isCase ? item.cases_qty : item.pieces_qty) ?? item.qty ?? 0);

    // 2. Units/Case
    const unitsPerCase = Number(item.units_per_case_snapshot ?? item.units_per_case ?? 0);

    // 3. Line Total - ABSOLUTE SOURCE OF TRUTH
    // If we have line_total_snapshot or ext_amount, we use it as is. Never recompute if stored.
    let lineTotal = Number(item.line_total_snapshot ?? item.ext_amount ?? -1);

    // 4. Prices - Favor unit_price_snapshot, then edited_unit_price, then base unit_price
    let unitPrice = Number(item.unit_price_snapshot ?? item.edited_unit_price ?? item.unit_price ?? 0);
    let casePrice = Number(item.case_price_snapshot ?? -1);

    // Legacy fallback logic for prices
    if (isCase) {
        if (casePrice < 0) {
            // In legacy, if order_unit was 'case', unit_price column often ALREADY stored the case price.
            if (item.order_unit === 'case') {
                casePrice = unitPrice;
                // If it's a case but we only have Case Price, we might want to derive unit price for display
                if (unitPrice > 0 && unitsPerCase > 1) {
                    unitPrice = casePrice / unitsPerCase;
                }
            } else if (unitsPerCase > 0) {
                casePrice = unitPrice * unitsPerCase;
            } else {
                casePrice = unitPrice;
            }
        }
    } else {
        // Piece mode
        if (unitPrice <= 0 && casePrice > 0 && unitsPerCase > 0) {
            unitPrice = casePrice / unitsPerCase;
        }
    }

    // 5. Final Line Total Calculation (only if missing from DB)
    if (lineTotal < 0) {
        lineTotal = qty * (isCase ? casePrice : unitPrice);
    }

    return {
        id: item.id,
        productName: item.product_name_snapshot || item.product_name || (Array.isArray(item.products) ? item.products[0]?.name : item.products?.name) || 'Unknown Item',
        categoryName: item.category_label || item.category_name_snapshot || item.category_name || '—',
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

/**
 * Formats a number as USD currency.
 */
export function formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
}
