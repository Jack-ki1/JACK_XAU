// api/providers/priceProvider — swappable market-data abstraction (v2 C1.1).
// Priority: MT5 bridge (future, via candles pushed to the store) →
// Twelve Data (live) → candle store (recent, still fresh) → simulated.
// Every live fetch goes through the credit ledger; results are labelled
// with the source + staleness so the UI can show an honest data badge.
import { fetchBarsSince, fetchSpotPrice, resolutionKey, type TdBar } from './twelveData.js';
import { preflight, commit, type CreditSlot } from '../lib/credits.js';

export type ProviderSource = 'twelvedata' | 'candle_store' | 'simulated' | 'mt5'

export interface ProviderQuote {
  price: number | null
  source: ProviderSource
  fetchedAt: string
  stale: boolean
}

export interface ProviderBars {
  bars: TdBar[]
  source: ProviderSource
  fetchedAt: string
  stale: boolean
  creditsUsed: number
}

const STALE_MS = 90_000 // quotes older than 90s are marked stale

export async function getQuote(slot: CreditSlot = 'levels'): Promise<ProviderQuote> {
  const fetchedAt = new Date().toISOString()
  const key = resolutionKey();
  if (!key) return { price: null, source: 'simulated', fetchedAt, stale: true }
  const decision = await preflight(slot, 1)
  if (!decision.allowed) return { price: null, source: 'simulated', fetchedAt, stale: true }
  const price = await fetchSpotPrice(key)
  if (price != null) await commit(slot, 1)
  return { price, source: price != null ? 'twelvedata' : 'simulated', fetchedAt, stale: price == null }
}

export async function getBars(
  fromIso: string,
  interval: string,
  slot: CreditSlot = 'resolution',
): Promise<ProviderBars> {
  const fetchedAt = new Date().toISOString()
  const key = resolutionKey()
  if (!key) return { bars: [], source: 'simulated', fetchedAt, stale: true, creditsUsed: 0 }
  const decision = await preflight(slot, 1)
  if (!decision.allowed) return { bars: [], source: 'simulated', fetchedAt, stale: true, creditsUsed: 0 }
  const bars = await fetchBarsSince(fromIso, interval, key)
  if (bars.length > 0) await commit(slot, 1)
  return {
    bars,
    source: bars.length > 0 ? 'twelvedata' : 'simulated',
    fetchedAt,
    stale: bars.length === 0,
    creditsUsed: bars.length > 0 ? 1 : 0,
  }
}

export function isStale(fetchedAtIso: string): boolean {
  const t = new Date(fetchedAtIso).getTime()
  return !Number.isFinite(t) || Date.now() - t > STALE_MS
}
