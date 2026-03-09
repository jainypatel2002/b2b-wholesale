const NON_ALPHANUMERIC = /[^0-9a-z]+/gi

function normalizeBarcodeLegacy(input: string): string {
    return String(input || '')
        .trim()
        .replace(NON_ALPHANUMERIC, '')
        .toUpperCase()
}

function stripSingleLeadingZero(value: string): string {
    if (!value.startsWith('0')) return value
    return value.slice(1)
}

export function normalizeBarcode(input: string): string {
    return stripSingleLeadingZero(normalizeBarcodeLegacy(input))
}

export function sanitizeBarcode(rawBarcode: string): string {
    return normalizeBarcode(rawBarcode)
}

export function getBarcodeLookupCandidates(input: string): string[] {
    const legacyNormalized = normalizeBarcodeLegacy(input)
    const normalized = stripSingleLeadingZero(legacyNormalized)
    const prefixedNormalized = normalized ? `0${normalized}` : ''

    return Array.from(
        new Set(
            [normalized, legacyNormalized, prefixedNormalized].filter(Boolean)
        )
    )
}

export function isLookupBarcodeValid(input: string, minLength = 6): boolean {
    return getBarcodeLookupCandidates(input).some((barcode) => barcode.length >= minLength)
}

export function isNormalizedBarcode(value: string): boolean {
    const normalized = normalizeBarcode(value)
    return normalized.length >= 6 && normalized === value
}
