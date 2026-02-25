
/**
 * Safe currency formatter
 */
export function formatMoney(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount)
}

/**
 * KPI-friendly compact currency formatter.
 * Examples: $33,879.34, $33.9K, $33.9M
 */
export function formatCurrencyCompact(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00'

    const absAmount = Math.abs(amount)
    const sign = amount < 0 ? '-' : ''

    if (absAmount >= 1_000_000) {
        const compact = (absAmount / 1_000_000).toFixed(1).replace(/\.0$/, '')
        return `${sign}$${compact}M`
    }

    if (absAmount >= 1_000) {
        const compact = (absAmount / 1_000).toFixed(1).replace(/\.0$/, '')
        return `${sign}$${compact}K`
    }

    return formatMoney(amount)
}

/**
 * Safe percentage formatter
 */
export function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '0%'
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value / 100)
}

/**
 * Calculate Revenue
 * Sum of (selling_price_at_time * quantity)
 */
export function calcRevenue(items: { selling_price_at_time: number | null; quantity: number }[]): number {
    return items.reduce((sum, item) => {
        const price = item.selling_price_at_time || 0
        return sum + (price * (item.quantity || 0))
    }, 0)
}

/**
 * Calculate Cost
 * Sum of (cost_price_at_time * quantity)
 * Handles missing cost_price by treating it as 0 but flagging likely issues elsewhere if needed
 */
export function calcCost(items: { cost_price_at_time: number | null; quantity: number }[]): number {
    return items.reduce((sum, item) => {
        const cost = item.cost_price_at_time || 0
        return sum + (cost * (item.quantity || 0))
    }, 0)
}

/**
 * Calculate Profit
 * Revenue - Cost
 */
export function calcProfit(revenue: number, cost: number): number {
    return revenue - cost
}

/**
 * Calculate Margin %
 * (Profit / Revenue) * 100
 * returns 0 if revenue is 0 to avoid division by zero
 */
export function calcMargin(profit: number, revenue: number): number {
    if (!revenue || revenue === 0) return 0
    return (profit / revenue) * 100
}

// Minimal in-file tests (runtime check)
if (process.env.NODE_ENV === 'test') {
    console.assert(formatMoney(10.5) === '$10.50', 'formatMoney failed')
    console.assert(formatCurrencyCompact(10.5) === '$10.50', 'formatCurrencyCompact plain failed')
    console.assert(formatCurrencyCompact(33879.34) === '$33.9K', 'formatCurrencyCompact K failed')
    console.assert(formatCurrencyCompact(33879340) === '$33.9M', 'formatCurrencyCompact M failed')
    console.assert(formatPercent(12.5) === '12.5%', 'formatPercent failed')
    console.assert(calcRevenue([{ selling_price_at_time: 10, quantity: 2 }]) === 20, 'calcRevenue failed')
    console.assert(calcCost([{ cost_price_at_time: 5, quantity: 2 }]) === 10, 'calcCost failed')
    console.assert(calcProfit(100, 60) === 40, 'calcProfit failed')
    console.assert(Math.abs(calcMargin(40, 100) - 40) < 0.01, 'calcMargin failed')
}
