const NON_ALPHANUMERIC = /[^0-9a-z]+/gi

export function normalizeBarcode(input: string): string {
    return String(input || '')
        .trim()
        .replace(NON_ALPHANUMERIC, '')
        .toUpperCase()
}

export function sanitizeBarcode(rawBarcode: string): string {
    return normalizeBarcode(rawBarcode)
}

export function isNormalizedBarcode(value: string): boolean {
    const normalized = normalizeBarcode(value)
    return normalized.length >= 6 && normalized === value
}
