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
        const old_record = payload.old_record

        if (!record || !old_record) {
            console.log("Not an UPDATE event or missing required records")
            return new Response(JSON.stringify({ ok: true, action: 'ignored', reason: 'Not an UPDATE event or missing required records' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // Determine Acceptance (Broad approach as requested to handle various flows, relying on idempotency)
        const isAcceptedStatus = ['accepted', 'approved', 'confirmed', 'fulfilled'].includes(record.status)
        const hasInvoice = record.invoice_id !== null && record.invoice_id !== undefined
        const isAccepted = isAcceptedStatus || hasInvoice

        if (!isAccepted) {
            console.log(`Order not yet accepted (status: ${record.status})`)
            return new Response(JSON.stringify({ ok: true, action: 'ignored', reason: 'Order not accepted yet' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        const { id: order_id, distributor_id, vendor_id } = record

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error("Missing Supabase credentials")
            throw new Error("Missing Supabase environment variables")
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 2. Idempotency Check (This guarantees we ONLY send once even if status updates multiple times)
        const eventKey = `order_accepted:${order_id}`
        const { error: eventError } = await supabase
            .from('email_events')
            .insert({ event_key: eventKey })

        if (eventError) {
            if (eventError.code === '23505') { // Unique violation
                console.log(`Event ${eventKey} already processed. Skipping.`)
                return new Response(JSON.stringify({ ok: true, action: 'skipped_duplicate', reason: 'Already sent' }), {
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

        const vendorEmail = vendorData?.email
        if (!vendorEmail) {
            console.log("Vendor email not found. Skipping.")
            return new Response(JSON.stringify({ ok: true, action: 'missing_vendor_email', reason: 'vendor email not found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        const distName = distData?.display_name || distData?.email || 'Your Distributor'

        // 4. Insert In-App Notification
        const { error: notifError } = await supabase
            .from('notifications')
            .insert({
                user_id: vendor_id,
                type: 'order_accepted',
                title: 'Order Accepted',
                body: `Great news! Your recent order has been accepted by ${distName}.`,
                ref_type: 'order',
                ref_id: order_id
            })

        if (notifError) {
            console.warn("Failed to insert notification:", notifError)
        }

        // 5. Prepare Email
        const emailHtml = `
      <div style="font-family: sans-serif; max-w-md: 600px; margin: 0 auto;">
        <h2>Order Accepted</h2>
        <p>Hello ${vendorData?.display_name || 'Vendor'},</p>
        <p>Great news! Your recent order has been accepted by <strong>${distName}</strong>.</p>
        <p>Order ID: <code>${order_id}</code></p>
        <div style="margin-top: 24px;">
          <a href="${appUrl}/vendor/orders/${order_id}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
            View Order Status
          </a>
        </div>
      </div>
    `

        if (!resendApiKey) {
            console.warn("RESEND_API_KEY missing, skipping actual email delivery.")
            return new Response(JSON.stringify({ ok: true, action: 'skipped', reason: 'dry run (missing resend key)' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // 6. Send Email
        async function sendEmail(fromSender: string) {
            return await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: fromSender,
                    to: vendorEmail, // sending TO vendor
                    subject: `Your order was accepted by ${distName}`,
                    html: emailHtml
                })
            })
        }

        let resendRes = await sendEmail(resendFrom)

        // Fallback if configured sender fails (e.g. unverified domain)
        if (!resendRes.ok) {
            const errText = await resendRes.text()
            console.warn(`Resend failed with configured sender (${resendFrom}): ${errText}. Attempting fallback...`)

            if (resendFrom !== 'onboarding@resend.dev' && (errText.toLowerCase().includes('domain') || resendRes.status === 403)) {
                console.log('Falling back to onboarding@resend.dev...')
                resendRes = await sendEmail('onboarding@resend.dev')

                if (!resendRes.ok) {
                    throw new Error(`Resend Fallback Error: ${await resendRes.text()}`)
                }
            } else {
                throw new Error(`Resend API Error: ${errText}`)
            }
        }

        console.log(`Email successfully sent to ${vendorEmail}`)
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
