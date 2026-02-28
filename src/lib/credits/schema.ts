const CREDIT_RELATIONS = ['vendor_credit_ledger', 'order_credit_applications'] as const
const CREDIT_FUNCTIONS = ['add_vendor_credit', 'deduct_vendor_credit', 'apply_vendor_credit_to_order'] as const

export const CREDIT_SYSTEM_MIGRATION = '20260322000001_vendor_credit_system.sql'

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

export function isMissingCreditSchemaError(error: any): boolean {
  if (!error) return false
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  const hint = String(error?.hint || '').toLowerCase()
  const combined = `${message} ${details} ${hint}`

  if (code === '42P01' || code === 'PGRST205') return true
  if (code === '42883' || code === 'PGRST202') return includesAny(combined, CREDIT_FUNCTIONS)
  if (message.includes('schema cache') && includesAny(combined, CREDIT_RELATIONS)) return true
  if (combined.includes('does not exist') && includesAny(combined, [...CREDIT_RELATIONS, ...CREDIT_FUNCTIONS])) return true
  if (combined.includes('could not find the table') && includesAny(combined, CREDIT_RELATIONS)) return true
  if (combined.includes('could not find the function') && includesAny(combined, CREDIT_FUNCTIONS)) return true

  return false
}

export function getCreditMigrationHint(): string {
  return `Apply ${CREDIT_SYSTEM_MIGRATION} in Supabase SQL Editor, then reload schema cache (Settings -> API -> Reload).`
}
