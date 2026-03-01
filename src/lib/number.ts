export function toNumber(value: unknown, fallback = 0): number {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
}
