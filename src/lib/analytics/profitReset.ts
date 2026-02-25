import { createClient } from '@/lib/supabase/server'

export type AnalyticsRange = {
  from: Date
  to: Date
}

export type EffectiveAnalyticsRange = {
  from: Date
  to: Date
  hasData: boolean
  selectedRangeBeforeReset: boolean
}

export type ProfitCenterReset = {
  id: string
  distributor_id: string
  reset_at: string
  reset_from_date: string | null
  reset_to_date: string | null
  note: string | null
  created_by: string
  created_at: string
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime())
}

function withStartOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function withEndOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

export function getEffectiveAnalyticsRange(
  range: AnalyticsRange,
  resetAt: Date | null | undefined
): EffectiveAnalyticsRange {
  const requestedFrom = withStartOfDay(new Date(range.from))
  const requestedTo = withEndOfDay(new Date(range.to))

  if (!isValidDate(requestedFrom) || !isValidDate(requestedTo)) {
    return {
      from: requestedFrom,
      to: requestedTo,
      hasData: false,
      selectedRangeBeforeReset: false
    }
  }

  const parsedResetAt =
    resetAt && isValidDate(resetAt)
      ? resetAt
      : null

  const selectedRangeBeforeReset = !!parsedResetAt && requestedTo.getTime() < parsedResetAt.getTime()

  const effectiveFrom = parsedResetAt && parsedResetAt.getTime() > requestedFrom.getTime()
    ? new Date(parsedResetAt)
    : requestedFrom

  return {
    from: effectiveFrom,
    to: requestedTo,
    hasData: effectiveFrom.getTime() <= requestedTo.getTime(),
    selectedRangeBeforeReset
  }
}

export async function getLatestProfitResetWithClient(
  supabase: any,
  distributorId: string
): Promise<ProfitCenterReset | null> {
  const { data, error } = await supabase
    .from('profit_center_resets')
    .select('id, distributor_id, reset_at, reset_from_date, reset_to_date, note, created_by, created_at')
    .eq('distributor_id', distributorId)
    .order('reset_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Table missing prior to migration or no rows returned from maybeSingle edge cases.
    if (error.code === '42P01' || error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  if (!data?.reset_at) return null

  const resetAt = new Date(data.reset_at)
  if (!isValidDate(resetAt)) return null

  return data as ProfitCenterReset
}

export async function getLatestProfitReset(distributorId: string) {
  const supabase = await createClient()
  return getLatestProfitResetWithClient(supabase, distributorId)
}
