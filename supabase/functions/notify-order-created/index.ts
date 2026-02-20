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

        const vendorName = vendorData?.display_name || vendorData?.email || 'A vendor'

        // 4. Insert In-App Notification
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

        // 5. Prepare Email
        const emailHtml = `
      <div style="font-family: sans-serif; max-w-md: 600px; margin: 0 auto;">
        <h2>New Order Received</h2>
        <p>Hello ${distData?.display_name || 'Distributor'},</p>
        <p>You have received a new order from <strong>${vendorName}</strong>.</p>
        <p>Order ID: <code>${order_id}</code></p>
        <div style="margin-top: 24px;">
          <a href="${appUrl}/distributor/orders/${order_id}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
            View Order Dashboard
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
                    to: distEmail,
                    subject: `New Order from ${vendorName}`,
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
