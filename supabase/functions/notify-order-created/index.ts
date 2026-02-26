import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_API_URL')
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
const workerSecret = Deno.env.get('EMAIL_WORKER_SECRET')

/**
 * Mechanism note:
 * - DB trigger on orders INSERT enqueues ORDER_PLACED in email_events.
 * - This webhook-compatible function backfills queue enqueue via RPC (idempotent)
 *   and nudges process-email-events for near-real-time delivery.
 */
async function triggerEmailWorker(orderId: string) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return { invoked: false, reason: 'missing_worker_config' as const }
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/process-email-events`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json'
  }
  if (workerSecret) headers['x-email-worker-secret'] = workerSecret

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      limit: 20,
      order_id: orderId,
      event_type: 'ORDER_PLACED'
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`process-email-events failed (${res.status}): ${text}`)
  }

  return await res.json().catch(() => ({ invoked: true }))
}

serve(async (req) => {
  try {
    if (webhookSecret) {
      const reqSecret = req.headers.get('x-webhook-secret')
      if (reqSecret !== webhookSecret) {
        return new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    const payload = await req.json().catch(() => ({}))
    const record = payload?.record
    const orderId = typeof record?.id === 'string' ? record.id : null

    if (!orderId) {
      return new Response(JSON.stringify({ ok: true, action: 'ignored', reason: 'missing order id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase service credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: enqueueError } = await supabase.rpc('enqueue_order_placed_email_for_order', {
      p_order_id: orderId
    })

    if (enqueueError) {
      throw new Error(`enqueue_order_placed_email_for_order failed: ${enqueueError.message}`)
    }

    let workerResult: Record<string, unknown> | null = null
    try {
      workerResult = await triggerEmailWorker(orderId)
    } catch (workerError) {
      console.error(`[notify-order-created] worker invoke failed for order=${orderId}`, workerError)
    }

    console.log(JSON.stringify({
      event: 'ORDER_PLACED',
      order_id: orderId,
      status: 'queued',
      worker: workerResult || 'invoke_failed'
    }))

    return new Response(JSON.stringify({
      ok: true,
      action: 'queued',
      event_type: 'ORDER_PLACED',
      order_id: orderId,
      worker: workerResult
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('[notify-order-created] Error:', error)
    return new Response(JSON.stringify({ ok: false, reason: error?.message || 'unknown error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
