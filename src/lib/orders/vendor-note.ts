export const MAX_VENDOR_NOTE_LENGTH = 500

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const HTML_TAG_REGEX = /<[^>]*>/g

export type VendorNoteValidationResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string }

export function validateVendorNote(input: unknown): VendorNoteValidationResult {
  if (input === null || input === undefined) {
    return { ok: true, note: null }
  }

  if (typeof input !== 'string') {
    return { ok: false, error: 'Invalid note format' }
  }

  const normalized = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(HTML_TAG_REGEX, '')
    .replace(CONTROL_CHARS_REGEX, '')
    .trim()

  if (!normalized) {
    return { ok: true, note: null }
  }

  if (normalized.length > MAX_VENDOR_NOTE_LENGTH) {
    return { ok: false, error: `Note must be ${MAX_VENDOR_NOTE_LENGTH} characters or less` }
  }

  return { ok: true, note: normalized }
}
