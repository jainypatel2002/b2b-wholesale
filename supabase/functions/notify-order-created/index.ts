import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const resendApiKey = Deno.env.get('RESEND_API_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_API_URL')
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://distributor-vendor-portal.vercel.app'
const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
const resendFrom = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev'

serve(async (req) => {
    try {
        // 1. Webhook Authentication
        if (webhookSecret) {
            const reqSecret = req.headers.get('x-webhook-secret')
            if (reqSecret !== webhookSecret) {
                console.warn("Unauthorized webhook attempt")
                return new Response(JSON.stringify({ ok: false, action: 'ignored', reason: 'unauthorized' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                })
            }
        }

        const payload = await req.json()
        const record = payload.record

        if (!record || !record.id || !record.distributor_id || !record.vendor_id) {
            console.log("Missing essential fields")
            return new Response(JSON.stringify({ ok: true, action: 'ignored', reason: 'missing essential fields' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        const { id: order_id, distributor_id, vendor_id } = record

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error("Missing Supabase credentials:", { url: !!supabaseUrl, key: !!supabaseServiceKey })
            throw new Error("Missing Supabase environment variables")
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 2. Idempotency Check
        const eventKey = `order_created:${order_id}`
        const { error: eventError } = await supabase
            .from('email_events')
            .insert({ event_key: eventKey })

        if (eventError) {
            if (eventError.code === '23505') { // Unique violation
                console.log(`Event ${eventKey} already processed. Skipping.`)
                return new Response(JSON.stringify({ ok: true, action: 'skipped', reason: 'Already sent' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 200
                })
            }
            throw eventError
        }

        // 3. Fetch Context
        const { data: distData } = await supabase
            .from('profiles')
            .select('email, display_name')
            .eq('id', distributor_id)
            .single()

        const { data: vendorData } = await supabase
            .from('profiles')
            .select('display_name, email')
            .eq('id', vendor_id)
            .single()

        const distEmail = distData?.email
        if (!distEmail) {
            console.log("Distributor email not found. Skipping.")
            return new Response(JSON.stringify({ ok: true, action: 'skipped', reason: 'distributor email not found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        const distName = distData?.display_name || 'Distributor'
        const vendorName = vendorData?.display_name || vendorData?.email || 'A vendor'
        const vendorEmail = vendorData?.email || ''

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
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })

        // 5. Insert In-App Notification
        const { error: notifError } = await supabase
            .from('notifications')
            .insert({
                user_id: distributor_id,
                type: 'order_created',
                title: 'New Order Received',
                body: `You have received a new order from ${vendorName}.`,
                ref_type: 'order',
                ref_id: order_id
            })

        if (notifError) {
            console.warn("Failed to insert notification:", notifError)
        }

        // 6. Prepare Professional Email
        const dashboardUrl = `${appUrl}/distributor/orders/${order_id}`

        const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order Received</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${distName}</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#bfdbfe;font-weight:400;">Wholesale Order Notification</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:36px 40px 20px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">🧾 New Order Received</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                You have received a new order from <strong style="color:#0f172a;">${vendorName}</strong>.
              </p>

              <!-- Order Details Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Order ID</span><br>
                          <span style="font-size:15px;font-weight:600;color:#0f172a;font-family:'Courier New',monospace;">#${orderShortId}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Vendor Name</span><br>
                          <span style="font-size:15px;color:#0f172a;">${vendorName}</span>
                        </td>
                      </tr>
                      ${vendorEmail ? `<tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Vendor Email</span><br>
                          <span style="font-size:15px;color:#0f172a;">${vendorEmail}</span>
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Order Total</span><br>
                          <span style="font-size:18px;font-weight:700;color:#059669;">$${orderTotal.toFixed(2)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Order Date</span><br>
                          <span style="font-size:15px;color:#0f172a;">${orderDate}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:8px 40px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block;padding:14px 36px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.2px;box-shadow:0 2px 4px rgba(37,99,235,0.3);">
                      View Order Details →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background-color:#e2e8f0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#64748b;">${distName}</p>
              <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">${distEmail}</p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;line-height:1.5;">
                This is an automated notification from your Wholesale Portal system.<br>
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

        if (!resendApiKey) {
            console.warn("RESEND_API_KEY missing, skipping actual email delivery.")
            return new Response(JSON.stringify({ ok: true, action: 'skipped', reason: 'dry run (missing resend key)' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // 7. Send Email
        const senderName = `${distName} Orders`
        const fallbackSenderName = 'Wholesale Portal'

        async function sendEmail(fromAddress: string, displayName: string) {
            return await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: `${displayName} <${fromAddress}>`,
                    to: distEmail,
                    subject: `🧾 New Order Received – Order #${orderShortId}`,
                    html: emailHtml
                })
            })
        }

        let resendRes = await sendEmail(resendFrom, senderName)

        // Fallback if configured sender fails (e.g. unverified domain)
        if (!resendRes.ok) {
            const errText = await resendRes.text()
            console.warn(`Resend failed with configured sender (${resendFrom}): ${errText}. Attempting fallback...`)

            if (resendFrom !== 'onboarding@resend.dev' && (errText.toLowerCase().includes('domain') || resendRes.status === 403)) {
                console.log('Falling back to onboarding@resend.dev...')
                resendRes = await sendEmail('onboarding@resend.dev', fallbackSenderName)

                if (!resendRes.ok) {
                    throw new Error(`Resend Fallback Error: ${await resendRes.text()}`)
                }
            } else {
                throw new Error(`Resend API Error: ${errText}`)
            }
        }

        console.log(`Email successfully sent to ${distEmail}`)
        return new Response(JSON.stringify({ ok: true, action: 'sent' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        })
    } catch (error: any) {
        console.error("Function Error:", error)
        return new Response(JSON.stringify({ ok: false, action: 'error', reason: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
