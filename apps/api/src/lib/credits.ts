// api/lib/credits — provider credit ledger (v2 C1.2).
// Twelve Data Basic: ~8 credits/min, ~800/day per account. Three env slots
// may point at one account (shared limit) or three (independent); we track
// per-slot in memory (minute window) + persist daily totals (av_usage) so
// the desk never blindly burns quota. Consumers call `preflight` before a
// fetch and `commit` after; `summary` feeds /v1/ops/credits + System Health.
import { bumpUsage, getUsage } from '../repositories/repos.js';

export type CreditSlot = 'resolution' | 'backtest' | 'analysed_signals' | 'news_signals' | 'levels'

export const SLOT_DAILY_LIMITS: Record<CreditSlot, number> = {
  resolution: 800,
  backtest: 800,
  analysed_signals: 800,
  news_signals: 800,
  levels: 800,
}

/** Conservative per-minute budget per slot (Basic free tier ≈ 8/min). */
export const SLOT_PER_MINUTE_LIMITS: Record<CreditSlot, number> = {
  resolution: 7,
  backtest: 4, // paginated backtests are bursty — leave headroom
  analysed_signals: 5,
  news_signals: 5,
  levels: 3,
}

interface MinuteBucket {
  minute: number
  count: number
}

const minuteBuckets = new Map<string, MinuteBucket>()

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000)
}

export interface CreditDecision {
  allowed: boolean
  reason?: 'minute_limit' | 'daily_limit'
  minuteUsed?: number
  minuteLimit?: number
  dayUsed?: number
  dayLimit?: number
}

/** In-memory minute-window check (synchronous, no I/O). */
export function minuteBudget(slot: CreditSlot, cost = 1): { allowed: boolean; used: number; limit: number } {
  const minute = currentMinute()
  const key = `${slot}:${minute}`
  const bucket = minuteBuckets.get(key)
  const used = bucket && bucket.minute === minute ? bucket.count : 0
  const limit = SLOT_PER_MINUTE_LIMITS[slot]
  return { allowed: used + cost <= limit, used, limit }
}

export function commitMinute(slot: CreditSlot, cost = 1): void {
  const minute = currentMinute()
  const key = `${slot}:${minute}`
  const bucket = minuteBuckets.get(key)
  if (!bucket || bucket.minute !== minute) minuteBuckets.set(key, { minute, count: cost })
  else bucket.count += cost
  // Prune stale buckets occasionally
  if (minuteBuckets.size > 500) {
    for (const [k, b] of minuteBuckets) if (b.minute < minute - 2) minuteBuckets.delete(k)
  }
}

/** Full preflight: minute window + persisted daily total. */
export async function preflight(slot: CreditSlot, cost = 1): Promise<CreditDecision> {
  const m = minuteBudget(slot, cost)
  if (!m.allowed) return { allowed: false, reason: 'minute_limit', minuteUsed: m.used, minuteLimit: m.limit, dayLimit: SLOT_DAILY_LIMITS[slot] }
  const dayUsed = await getUsage('av_usage', slot)
  const dayLimit = SLOT_DAILY_LIMITS[slot]
  if (dayUsed + cost > dayLimit) return { allowed: false, reason: 'daily_limit', dayUsed, dayLimit, minuteUsed: m.used, minuteLimit: m.limit }
  return { allowed: true, minuteUsed: m.used, minuteLimit: m.limit, dayUsed, dayLimit }
}

/** Commit spend: memory window + DB daily row. Returns new day total. */
export async function commit(slot: CreditSlot, cost = 1): Promise<number> {
  commitMinute(slot, cost)
  return bumpUsage('av_usage', slot, cost)
}

export async function creditSummary(): Promise<Record<string, { dayUsed: number; dayLimit: number; minuteUsed: number; minuteLimit: number }>> {
  const minute = currentMinute()
  const out: Record<string, { dayUsed: number; dayLimit: number; minuteUsed: number; minuteLimit: number }> = {}
  for (const slot of Object.keys(SLOT_DAILY_LIMITS) as CreditSlot[]) {
    const bucket = minuteBuckets.get(`${slot}:${minute}`)
    out[slot] = {
      dayUsed: await getUsage('av_usage', slot),
      dayLimit: SLOT_DAILY_LIMITS[slot],
      minuteUsed: bucket && bucket.minute === minute ? bucket.count : 0,
      minuteLimit: SLOT_PER_MINUTE_LIMITS[slot],
    }
  }
  return out
}
