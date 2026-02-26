import 'server-only'

type KickEmailWorkerParams = {
  orderId?: string
  eventType?: 'ORDER_PLACED' | 'ORDER_ACCEPTED'
  limit?: number
}

export async function kickEmailWorker(params: KickEmailWorkerParams = {}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!supabaseUrl) return

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/process-email-events`
  const authToken = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const workerSecret = process.env.EMAIL_WORKER_SECRET

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }
  if (workerSecret) {
    headers['x-email-worker-secret'] = workerSecret
  }

  const body: Record<string, unknown> = {
    limit: typeof params.limit === 'number' ? Math.max(1, Math.min(100, Math.floor(params.limit))) : 20
  }
  if (params.orderId) body.order_id = params.orderId
  if (params.eventType) body.event_type = params.eventType

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[kickEmailWorker] process-email-events failed (${res.status}): ${errText}`)
    }
  } catch (error) {
    console.error('[kickEmailWorker] Failed to invoke process-email-events', error)
  }
}
