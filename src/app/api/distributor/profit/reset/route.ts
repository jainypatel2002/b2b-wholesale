import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

function normalizeDateInput(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const { supabase } = createRouteClient(request)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (!profile || profile.role !== 'distributor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: any = {}
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const resetFromDate = normalizeDateInput(payload?.from)
  const resetToDate = normalizeDateInput(payload?.to)
  const note = typeof payload?.note === 'string' ? payload.note.trim().slice(0, 500) : null

  if (payload?.from && !resetFromDate) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }

  if (payload?.to && !resetToDate) {
    return NextResponse.json({ error: 'Invalid to date' }, { status: 400 })
  }

  if (resetFromDate && resetToDate && resetFromDate > resetToDate) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const { data: reset, error } = await supabase
    .from('profit_center_resets')
    .insert({
      distributor_id: profile.id,
      created_by: auth.user.id,
      reset_from_date: resetFromDate,
      reset_to_date: resetToDate,
      note: note || null
    })
    .select('id, distributor_id, reset_at, reset_from_date, reset_to_date, created_by, created_at')
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Profit reset feature is not available yet. Please run the latest migration.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, reset })
}
