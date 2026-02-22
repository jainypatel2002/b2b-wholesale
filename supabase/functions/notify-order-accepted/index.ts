import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const resendApiKey = Deno.env.get('RESEND_API_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_API_URL')
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://distributor-vendor-portal.vercel.app'
const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
const resendFrom = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev'

/**
 * Resolve a user's email from profiles first, then fall back to auth.users.
 * Uses service_role so RLS is bypassed.
 */
async function resolveEmail(
  supabase: any,
  userId: string,
  label: string
): Promise<{ email: string | null; notificationEmail: string | null; displayName: string | null; method: string }> {
  // Step 1: Try profiles table
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('email, display_name, notification_email')
    .eq('id', userId)
    .single()

  if (profErr) {
    console.warn(`[${label}] profiles lookup failed for ${userId}:`, profErr.message)
  }

  if (profile?.email || profile?.notification_email) {
    console.log(`[${label}] Resolved from profiles: email=${profile.email}, notification_email=${profile.notification_email}`)
    return {
      email: profile.email,
      notificationEmail: profile.notification_email,
      displayName: profile.display_name,
      method: 'profiles'
    }
  }

  // Step 2: Fallback to auth.users
  console.log(`[${label}] profiles.email is null for ${userId}, falling back to auth.users`)
  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(userId)

  if (authErr) {
    console.error(`[${label}] auth.users lookup failed for ${userId}:`, authErr.message)
    return { email: null, notificationEmail: null, displayName: profile?.display_name || null, method: 'none' }
  }

  const authEmail = authUser?.user?.email || null
  console.log(`[${label}] Resolved from auth.users: email=${authEmail}`)

  // Backfill profiles.email to prevent future fallback
  if (authEmail) {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ email: authEmail })
      .eq('id', userId)
    if (updateErr) {
      console.warn(`[${label}] Failed to backfill profiles.email for ${userId}:`, updateErr.message)
    } else {
      console.log(`[${label}] Backfilled profiles.email for ${userId}`)
    }
  }

  return {
    email: authEmail,
    notificationEmail: profile?.notification_email || null,
    displayName: profile?.display_name || null,
    method: 'auth.users'
  }
}

serve(async (req) => {
  try {
    // 1. Webhook Authentication
    if (webhookSecret) {
      const reqSecret = req.headers.get('x-webhook-secret')
      if (reqSecret !== webhookSecret) {
        console.warn("Unauthorized webhook attempt")
        return new Response(JSON.stringify({ ok: false, action: 'ignored', reason: 'unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    const payload = await req.json()
    const record = payload.record
    const old_record = payload.old_record

    if (!record || !old_record) {
      console.log("Not an UPDATE event or missing required records")
      return new Response(JSON.stringify({ ok: true, action: 'ignored', reason: 'Not an UPDATE event' }), {
        headers: { 'Content-Type': 'application/json' }, status: 200
      })
    }

    // ── Status Transition Guard ──────────────────────────────────────
    // Only send when status ACTUALLY TRANSITIONS to an accepted state.
    const acceptedStatuses = ['accepted', 'approved', 'confirmed', 'fulfilled']
    const wasAlreadyAccepted = acceptedStatuses.includes(old_record.status)
    const isNowAccepted = acceptedStatuses.includes(record.status)

    if (wasAlreadyAccepted || !isNowAccepted) {
      console.log(`Skipping: status transition ${old_record.status} → ${record.status} (not a new acceptance)`)
      return new Response(JSON.stringify({
        ok: true, action: 'ignored',
        reason: wasAlreadyAccepted
          ? `Already accepted (old: ${old_record.status})`
          : `Not transitioning to accepted (new: ${record.status})`,
        order_id: record.id
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    }

    const { id: order_id, distributor_id, vendor_id } = record
    console.log(`[notify-order-accepted] Invoked for order=${order_id}, distributor=${distributor_id}, vendor=${vendor_id}, transition=${old_record.status}→${record.status}`)

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials")
      throw new Error("Missing Supabase environment variables")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Idempotency Check
    const eventKey = `order_accepted:${order_id}`
    const { error: eventError } = await supabase
      .from('email_events')
      .insert({ event_key: eventKey })

    if (eventError) {
      if (eventError.code === '23505') {
        console.log(`Event ${eventKey} already processed. Skipping.`)
        return new Response(JSON.stringify({
          ok: true, action: 'skipped_duplicate', reason: 'Already sent',
          order_id, distributor_id
        }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
      }
      console.error("email_events insert error:", eventError)
      throw eventError
    }

    // 3. Resolve emails using robust lookup (profiles → auth.users fallback)
    const distInfo = await resolveEmail(supabase, distributor_id, 'distributor')
    const vendorInfo = await resolveEmail(supabase, vendor_id, 'vendor')

    // Vendor receives this email
    const vendorEmail = vendorInfo.notificationEmail || vendorInfo.email
    if (!vendorEmail) {
      console.error(`Vendor email not resolvable for ${vendor_id} (method: ${vendorInfo.method})`)
      return new Response(JSON.stringify({
        ok: false, action: 'skipped', reason: `vendor email not found (tried: ${vendorInfo.method})`,
        order_id, vendor_id
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    }

    const distName = distInfo.displayName || distInfo.email || 'Your Distributor'
    const distEmail = distInfo.email || ''
    const vendorName = vendorInfo.displayName || 'Vendor'

    console.log(`[notify-order-accepted] Sending to: ${vendorEmail} (via ${vendorInfo.method}), dist=${distName}`)

    // 4. Fetch Order Total
    let orderTotal = 0
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('qty, unit_price')
        .eq('order_id', order_id)

      if (items && items.length > 0) {
        orderTotal = items.reduce((sum: number, i: any) => sum + (Number(i.qty) * Number(i.unit_price || 0)), 0)
      }
    } catch (e) {
      console.warn("Could not fetch order total:", e)
    }

    const orderShortId = order_id.slice(0, 8).toUpperCase()
    const orderDate = new Date(record.created_at || Date.now()).toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })

    // 5. Insert In-App Notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: vendor_id, type: 'order_accepted',
        title: 'Order Accepted',
        body: `Great news! Your recent order has been accepted by ${distName}.`,
        ref_type: 'order', ref_id: order_id
      })
    if (notifError) console.warn("Failed to insert notification:", notifError)

    // 6. Prepare Email HTML
    const orderUrl = `${appUrl}/vendor/orders/${order_id}`

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Order Accepted</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${distName}</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#a7f3d0;">Order Status Update</p>
        </td></tr>
        <tr><td style="padding:36px 40px 20px;">
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">✅ Order Accepted</h2>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">Great news, <strong style="color:#0f172a;">${vendorName}</strong>! Your order has been accepted by <strong style="color:#0f172a;">${distName}</strong>.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;overflow:hidden;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;border-bottom:1px solid #bbf7d0;"><span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Order ID</span><br><span style="font-size:15px;font-weight:600;color:#0f172a;font-family:monospace;">#${orderShortId}</span></td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #bbf7d0;"><span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Distributor</span><br><span style="font-size:15px;color:#0f172a;">${distName}</span></td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #bbf7d0;"><span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Order Total</span><br><span style="font-size:18px;font-weight:700;color:#059669;">$${orderTotal.toFixed(2)}</span></td></tr>
                <tr><td style="padding:8px 0;"><span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Order Date</span><br><span style="font-size:15px;color:#0f172a;">${orderDate}</span></td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:8px 40px 36px;" align="center">
          <a href="${orderUrl}" style="display:inline-block;padding:14px 36px;background-color:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">View Order Status →</a>
        </td></tr>
        <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#e2e8f0;"></div></td></tr>
        <tr><td style="padding:24px 40px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#64748b;">${distName}</p>
          ${distEmail ? `<p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">${distEmail}</p>` : ''}
          <p style="margin:0;font-size:11px;color:#cbd5e1;line-height:1.5;">This is an automated notification from your Wholesale Portal system.<br>Please do not reply directly to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY missing, skipping actual email delivery.")
      return new Response(JSON.stringify({
        ok: true, action: 'skipped', reason: 'dry run (missing resend key)',
        order_id, distributor_id, recipient: vendorEmail, lookup_method: vendorInfo.method
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
    }

    // 7. Send Email via Resend
    const senderName = `${distName} Orders`

    async function sendEmail(fromAddress: string, displayName: string) {
      return await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${displayName} <${fromAddress}>`,
          to: vendorEmail,
          subject: `✅ Order Accepted – Order #${orderShortId}`,
          html: emailHtml
        })
      })
    }

    let resendRes = await sendEmail(resendFrom, senderName)

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.warn(`Resend failed with ${resendFrom}: ${errText}. Attempting fallback...`)
      if (resendFrom !== 'onboarding@resend.dev' && (errText.toLowerCase().includes('domain') || resendRes.status === 403)) {
        resendRes = await sendEmail('onboarding@resend.dev', 'Wholesale Portal')
        if (!resendRes.ok) throw new Error(`Resend Fallback Error: ${await resendRes.text()}`)
      } else {
        throw new Error(`Resend API Error: ${errText}`)
      }
    }

    console.log(`[notify-order-accepted] Email sent to ${vendorEmail} for order ${order_id}`)
    return new Response(JSON.stringify({
      ok: true, action: 'sent', event: 'order_accepted',
      order_id, distributor_id, vendor_id, recipient: vendorEmail, lookup_method: vendorInfo.method
    }), { headers: { 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    console.error("[notify-order-accepted] Error:", error)
    return new Response(JSON.stringify({ ok: false, action: 'error', reason: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 400
    })
  }
})
