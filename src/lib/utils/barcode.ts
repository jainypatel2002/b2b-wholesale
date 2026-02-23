export function sanitizeBarcode(rawBarcode: string): string {
    return rawBarcode.replace(/[\s\W_]+/g, '').trim()
}
