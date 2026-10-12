// app/api/analyse-signals/route.ts
//
// STAGE CHANGE: this is no longer the primary path to analysis --
// that's now analyse-signal-now, triggered immediately by main.py the
// instant a signal is saved (real seconds-level latency instead of
// waiting for this cron). This route stays in place as a SAFETY NET:
// still runs every 10 minutes, and picks up anything the immediate
// trigger missed (a network hiccup, a timeout, OpenRouter being briefly
// unreachable) -- eventual consistency for the rare case the primary
// path fails, not the main way signals get analysed anymore.
//
// Now built on the same shared analyseOneSignal function the
// immediate route uses (lib/analysis/analyseSignal.ts) -- both paths
// run IDENTICAL logic, no risk of drifting apart.

import { createClient } from '@supabase/supabase-js'
import { analyseOneSignal, getToggleEnabled, DAILY_LIMIT } from '@/lib/analysis/analyseSignal'
import type { SignalRow, RouteResult } from '@jack-trade/shared'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'placeholder-service-key'
const supabase = createClient(supabaseUrl, supabaseKey)

const CRON_SECRET = process.env.CRON_SECRET
const MAX_SIGNALS_PER_RUN = 5

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  if (!CRON_SECRET || searchParams.get('secret') !== CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return Response.json({ error: 'SUPABASE_SERVICE_KEY not set.' })
  }

  const enabled = await getToggleEnabled()
  if (!enabled) {
    return Response.json({ skipped: true, reason: 'toggled_off' })
  }

  const { data: already } = await supabase.from('analysed_signals').select('signal_id')
  const analysedIds = new Set(((already ?? []) as { signal_id: string }[]).map((a) => a.signal_id))

  const { data: recentSignals } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200)

  const pending = ((recentSignals ?? []) as SignalRow[])
    .filter((s) => !analysedIds.has(s.signal_id))
    .slice(0, MAX_SIGNALS_PER_RUN)

  if (pending.length === 0) {
    return Response.json({ checked: 0, analysed: 0, note: 'Nothing pending -- either the immediate trigger is catching everything, or genuinely no new signals.' })
  }

  let analysedCount = 0
  const results: RouteResult[] = []

  for (const sig of pending) {
    const result = await analyseOneSignal(sig)
    results.push(result)
    if (result.outcome === 'analysed') analysedCount++
    if (result.outcome === 'stopped_early' || result.outcome === 'quota_exceeded') break
  }

  return Response.json({
    checked: pending.length,
    analysed: analysedCount,
    results,
    limit: DAILY_LIMIT,
  })
}