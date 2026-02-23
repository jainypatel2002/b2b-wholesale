/**
 * Pricing Wrapper (Legacy Support)
 * Redirects to pricing-engine.ts
 */

import { getEffectivePrice as getEffectivePriceNew, ProductPricing } from './pricing-engine';

export interface PricingProduct extends ProductPricing {
    id: string;
    sell_price: number | null;
    price_case: number | null;
    units_per_case: number | null;
}

export function getEffectivePrice(
    product: any,
    unitMode: 'piece' | 'case'
): number | null {
    return getEffectivePriceNew(product, unitMode);
}
