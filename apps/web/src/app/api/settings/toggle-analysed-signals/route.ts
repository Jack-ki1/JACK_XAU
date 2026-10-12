// app/api/settings/toggle-analysed-signals/route.ts
//
// Real server-side toggle, replacing the old localStorage-only switch.
// The frontend's toggle button should POST here instead of just writing
// to localStorage -- this is what actually lets the analyse-signals
// route know whether to run at all.

import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, rateLimited } from '@/lib/rateLimit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'placeholder-service-key'

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'analysed_signals_enabled')
    .maybeSingle()
  const enabled = data ? data.value === true || data.value === 'true' : true
  return Response.json({ enabled })
}

export async function POST(req: Request) {
  // Phase 1 (R2, interim): browser-called toggle — per-IP cap until the
  // Phase 3 token proxy owns writes.
  const limited = checkRateLimit(req, 'settings-toggle', 30, 86400);
  if (limited !== null) return rateLimited(limited);
  const body = await req.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') {
    return Response.json({ error: 'Request body must include a boolean "enabled" field.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'analysed_signals_enabled', value: body.enabled, updated_at: new Date().toISOString() })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ enabled: body.enabled })
}