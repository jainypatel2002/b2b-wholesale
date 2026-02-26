import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_API_URL')
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const configuredResendFrom = Deno.env.get('RESEND_FROM')
const resendFrom = configuredResendFrom || 'onboarding@resend.dev'
const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://distributor-vendor-portal.vercel.app').replace(/\/$/, '')
const workerSecret = Deno.env.get('EMAIL_WORKER_SECRET')

const MAX_ATTEMPTS = 5
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type EmailEventRow = {
  id: string
  event_type: string | null
  order_id: string | null
  distributor_id: string | null
  vendor_id: string | null
  to_email: string | null
  subject: string | null
  html: string | null
  payload: Record<string, unknown> | null
  attempts: number | null
  status: string | null
  created_at: string
}

type Identity = {
  email: string | null
  displayName: string | null
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `$${safe.toFixed(2)}`
}

function parseLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  const rounded = Math.floor(n)
  if (rounded < 1) return 1
  if (rounded > MAX_LIMIT) return MAX_LIMIT
  return rounded
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function resolveIdentity(supabase: any, userId: string | null): Promise<Identity> {
  if (!userId) return { email: null, displayName: null }

  let profileEmail: string | null = null
  let profileName: string | null = null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (profileError && profileError.code !== 'PGRST116') {
    console.warn(`[process-email-events] profiles lookup failed for ${userId}: ${profileError.message}`)
  } else {
    profileEmail = normalizeEmail(profile?.email)
    profileName = typeof profile?.display_name === 'string' ? profile.display_name.trim() || null : null
  }

  const { data: businessProfile, error: bpError } = await supabase
    .from('business_profiles')
    .select('business_name, email')
    .eq('user_id', userId)
    .maybeSingle()

  if (bpError && bpError.code !== 'PGRST116' && bpError.code !== '42P01') {
    console.warn(`[process-email-events] business_profiles lookup failed for ${userId}: ${bpError.message}`)
  }

  const businessName = typeof businessProfile?.business_name === 'string'
    ? businessProfile.business_name.trim() || null
    : null
  const businessEmail = normalizeEmail(businessProfile?.email)

  return {
    email: businessEmail || profileEmail,
    displayName: businessName || profileName || businessEmail || profileEmail
  }
}

async function fetchOrderTotal(supabase: any, orderId: string): Promise<number> {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('qty, unit_price')
    .eq('order_id', orderId)

  if (error) {
    throw new Error(`Failed to fetch order items for ${orderId}: ${error.message}`)
  }

  return (items || []).reduce((sum: number, item: any) => {
    return sum + (Number(item?.qty || 0) * Number(item?.unit_price || 0))
  }, 0)
}

function renderOrderPlacedHtml(params: {
  distributorName: string
  vendorName: string
  vendorEmail: string | null
  orderId: string
  total: number
  orderUrl: string
}): string {
  const distributorName = escapeHtml(params.distributorName)
  const vendorName = escapeHtml(params.vendorName)
  const vendorEmail = params.vendorEmail ? escapeHtml(params.vendorEmail) : null
  const orderId = escapeHtml(params.orderId)
  const total = escapeHtml(formatCurrency(params.total))
  const orderUrl = escapeHtml(params.orderUrl)

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>New order received</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 24px 8px;">
          <p style="margin:0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">${distributorName}</p>
          <h1 style="margin:10px 0 0;font-size:24px;color:#0f172a;">New order from ${vendorName}</h1>
        </td></tr>
        <tr><td style="padding:16px 24px 8px;">
          <p style="margin:0 0 10px;font-size:14px;color:#334155;">Order ID: <strong>${orderId}</strong></p>
          <p style="margin:0 0 10px;font-size:14px;color:#334155;">Vendor: <strong>${vendorName}</strong></p>
          ${vendorEmail ? `<p style="margin:0 0 10px;font-size:14px;color:#334155;">Vendor email: <strong>${vendorEmail}</strong></p>` : ''}
          <p style="margin:0 0 12px;font-size:14px;color:#334155;">Order total: <strong>${total}</strong></p>
          <a href="${orderUrl}" style="display:inline-block;margin-top:8px;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">Open Order</a>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">This email was generated automatically by Your Supply Bridge.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function renderOrderAcceptedHtml(params: {
  vendorName: string
  distributorName: string
  orderId: string
  total: number
  orderUrl: string
}): string {
  const vendorName = escapeHtml(params.vendorName)
  const distributorName = escapeHtml(params.distributorName)
  const orderId = escapeHtml(params.orderId)
  const total = escapeHtml(formatCurrency(params.total))
  const orderUrl = escapeHtml(params.orderUrl)

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Order accepted</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 24px 8px;">
          <p style="margin:0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Order update</p>
          <h1 style="margin:10px 0 0;font-size:24px;color:#0f172a;">Your order was accepted</h1>
        </td></tr>
        <tr><td style="padding:16px 24px 8px;">
          <p style="margin:0 0 10px;font-size:14px;color:#334155;">Hello ${vendorName}, your order has been accepted by <strong>${distributorName}</strong>.</p>
          <p style="margin:0 0 10px;font-size:14px;color:#334155;">Order ID: <strong>${orderId}</strong></p>
          <p style="margin:0 0 12px;font-size:14px;color:#334155;">Order total: <strong>${total}</strong></p>
          <a href="${orderUrl}" style="display:inline-block;margin-top:8px;padding:12px 18px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">View Order</a>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">This email was generated automatically by Your Supply Bridge.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (workerSecret) {
    const provided = req.headers.get('x-email-worker-secret')
    if (provided !== workerSecret) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Supabase service credentials' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const body = await req.json().catch(() => ({}))
  const limit = parseLimit(body?.limit)
  const orderIdFilter = typeof body?.order_id === 'string' ? body.order_id : null
  const eventTypeFilter = typeof body?.event_type === 'string' ? body.event_type.toUpperCase() : null

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let pendingQuery = supabase
    .from('email_events')
    .select('id, event_type, order_id, distributor_id, vendor_id, to_email, subject, html, payload, attempts, status, created_at')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (orderIdFilter) pendingQuery = pendingQuery.eq('order_id', orderIdFilter)
  if (eventTypeFilter) pendingQuery = pendingQuery.eq('event_type', eventTypeFilter)

  const { data: pendingRows, error: pendingError } = await pendingQuery

  if (pendingError) {
    return new Response(JSON.stringify({ ok: false, error: pendingError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let sent = 0
  let failed = 0
  let retried = 0
  let skipped = 0
  const rows = (pendingRows || []) as EmailEventRow[]

  for (const row of rows) {
    const nextAttempt = Number(row.attempts || 0) + 1

    const { data: claimedRow, error: claimError } = await supabase
      .from('email_events')
      .update({
        status: 'processing',
        attempts: nextAttempt,
        last_error: null
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id, event_type, order_id, distributor_id, vendor_id, to_email, subject, html, payload, attempts, status, created_at')
      .maybeSingle()

    if (claimError) {
      failed += 1
      console.error(JSON.stringify({
        event_id: row.id,
        event_type: row.event_type,
        order_id: row.order_id,
        to_email: row.to_email,
        status: 'claim_error',
        error: claimError.message
      }))
      continue
    }

    if (!claimedRow) {
      skipped += 1
      continue
    }

    const claimed = claimedRow as EmailEventRow

    try {
      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY is not configured')
      }
      if (!configuredResendFrom) {
        throw new Error(
          'RESEND_FROM is not configured. Set a verified sender domain in Supabase secrets. onboarding@resend.dev is sandbox-only.'
        )
      }

      const toEmail = normalizeEmail(claimed.to_email)
      if (!toEmail) {
        throw new Error('Recipient email is missing')
      }

      const payload = (claimed.payload && typeof claimed.payload === 'object')
        ? claimed.payload as Record<string, unknown>
        : {}

      const orderId = claimed.order_id || (typeof payload.order_id === 'string' ? payload.order_id : null)
      if (!orderId) {
        throw new Error('order_id is missing on email event')
      }

      const { data: orderRow, error: orderError } = await supabase
        .from('orders')
        .select('id, distributor_id, vendor_id')
        .eq('id', orderId)
        .maybeSingle()

      if (orderError && orderError.code !== 'PGRST116') {
        throw new Error(`Failed to load order ${orderId}: ${orderError.message}`)
      }
      if (!orderRow) {
        throw new Error(`Order ${orderId} was not found`)
      }

      const orderTotal = await fetchOrderTotal(supabase, orderId)
      const distributorIdentity = await resolveIdentity(supabase, orderRow.distributor_id)
      const vendorIdentity = await resolveIdentity(supabase, orderRow.vendor_id)

      const distributorName = String(
        payload.distributor_name
        || distributorIdentity.displayName
        || distributorIdentity.email
        || 'Distributor'
      )
      const vendorName = String(
        payload.vendor_name
        || vendorIdentity.displayName
        || vendorIdentity.email
        || 'Vendor'
      )

      const vendorEmail = normalizeEmail(payload.vendor_email || vendorIdentity.email)
      const distributorEmail = normalizeEmail(payload.distributor_email || distributorIdentity.email)

      let subject = (claimed.subject || '').trim()
      let html = claimed.html || ''

      if (claimed.event_type === 'ORDER_PLACED') {
        if (!subject) {
          subject = `New order from ${vendorName}`
        }
        html = renderOrderPlacedHtml({
          distributorName,
          vendorName,
          vendorEmail,
          orderId,
          total: orderTotal,
          orderUrl: `${appUrl}/distributor/orders/${orderId}`
        })
      } else if (claimed.event_type === 'ORDER_ACCEPTED') {
        if (!subject) {
          subject = 'Your order was accepted'
        }
        html = renderOrderAcceptedHtml({
          vendorName,
          distributorName,
          orderId,
          total: orderTotal,
          orderUrl: `${appUrl}/vendor/orders/${orderId}`
        })
      } else {
        throw new Error(`Unsupported event_type: ${claimed.event_type}`)
      }

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: resendFrom,
          to: toEmail,
          subject,
          html
        })
      })

      if (!resendResponse.ok) {
        const errText = await resendResponse.text()
        throw new Error(`Resend API ${resendResponse.status}: ${errText}`)
      }

      const resendResult = await resendResponse.json().catch(() => null)
      const patchedPayload = {
        ...payload,
        vendor_email: vendorEmail,
        distributor_email: distributorEmail,
        resend_id: resendResult?.id || null
      }

      const { error: sentUpdateError } = await supabase
        .from('email_events')
        .update({
          status: 'sent',
          to_email: toEmail,
          subject,
          html,
          payload: patchedPayload,
          sent_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', claimed.id)
        .eq('status', 'processing')

      if (sentUpdateError) {
        throw new Error(`Failed to mark event ${claimed.id} as sent: ${sentUpdateError.message}`)
      }

      sent += 1
      console.log(JSON.stringify({
        event_id: claimed.id,
        event_type: claimed.event_type,
        order_id: claimed.order_id,
        to_email: toEmail,
        status: 'sent'
      }))
    } catch (error) {
      const message = toErrorMessage(error)
      const attempts = Number(claimed.attempts || 0)
      const terminal = attempts >= MAX_ATTEMPTS
      const nextStatus = terminal ? 'failed' : 'pending'

      const { error: rollbackError } = await supabase
        .from('email_events')
        .update({
          status: nextStatus,
          last_error: message
        })
        .eq('id', claimed.id)
        .eq('status', 'processing')

      if (rollbackError) {
        failed += 1
        console.error(JSON.stringify({
          event_id: claimed.id,
          event_type: claimed.event_type,
          order_id: claimed.order_id,
          to_email: claimed.to_email,
          status: 'update_error',
          error: rollbackError.message,
          original_error: message
        }))
      } else if (terminal) {
        failed += 1
      } else {
        retried += 1
      }

      console.error(JSON.stringify({
        event_id: claimed.id,
        event_type: claimed.event_type,
        order_id: claimed.order_id,
        to_email: claimed.to_email,
        status: nextStatus,
        error: message
      }))
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scanned: rows.length,
    sent,
    retried,
    failed,
    skipped
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
