// api/services/candles — candle store with backfill + gap detection (v2 C1.4).
// The store is the reproducibility backbone: backtests should prefer it over
// live API calls. Gap detection reports holes in [from,to] per timeframe;
// the backfill job fills them from the provider through the credit ledger.
import { readCandles, upsertCandles, latestCandleTs, type CandleRow } from '../repositories/repos.js';
import { getBars } from '../providers/priceProvider.js';
import type { TdBar } from '../providers/twelveData.js';

export type StoredTf = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

const TF_MS: Record<StoredTf, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
}

const INTERVAL_MAP: Record<StoredTf, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
}

export function isStoredTf(v: unknown): v is StoredTf {
  return typeof v === 'string' && v in TF_MS
}

function toRow(tf: StoredTf, bar: TdBar, source: string): CandleRow {
  // Twelve Data "YYYY-MM-DD HH:mm:ss" is UTC for FX; normalise to ISO.
  const ts = bar.time.includes('T') ? bar.time : `${bar.time.replace(' ', 'T')}Z`
  return {
    symbol: 'XAUUSD',
    tf,
    ts_utc: new Date(ts).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    tick_volume: null,
    source,
  }
}

export interface GapReport {
  tf: StoredTf
  from: string
  to: string
  expectedBars: number
  presentBars: number
  gaps: Array<{ fromTs: string; toTs: string; missingApprox: number }>
}

/** Detect missing bars (holes > 1.5× tf spacing) in a fetched window. */
export function detectGaps(bars: CandleRow[], tf: StoredTf, fromIso: string, toIso: string): GapReport {
  const step = TF_MS[tf]
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  const expectedBars = Math.max(0, Math.floor((to - from) / step) + 1)
  const gaps: GapReport['gaps'] = []
  for (let i = 1; i < bars.length; i++) {
    const prev = new Date(bars[i - 1].ts_utc).getTime()
    const cur = new Date(bars[i].ts_utc).getTime()
    const delta = cur - prev
    if (delta > step * 1.5) {
      gaps.push({
        fromTs: bars[i - 1].ts_utc,
        toTs: bars[i].ts_utc,
        missingApprox: Math.max(0, Math.round(delta / step) - 1),
      })
    }
  }
  return {
    tf,
    from: fromIso,
    to: toIso,
    expectedBars,
    presentBars: bars.length,
    gaps,
  }
}

/** Outlier check: bar with range > 10× median range (bad tick guard). */
export function detectOutliers(bars: CandleRow[]): CandleRow[] {
  if (bars.length < 10) return []
  const ranges = bars.map((b) => b.high - b.low).sort((a, b) => a - b)
  const median = ranges[Math.floor(ranges.length / 2)]
  if (!(median > 0)) return []
  return bars.filter((b) => b.high - b.low > median * 10)
}

/** Read from the store; empty when DB missing. */
export async function storeCandles(tf: StoredTf, fromIso: string, toIso: string, limit = 5000): Promise<CandleRow[]> {
  return readCandles(tf, fromIso, toIso, limit)
}

/**
 * Backfill [from,to] for one tf via the provider, upsert into the store.
 * Idempotent. Returns written count + gap report before the fill.
 */
export async function backfill(tf: StoredTf, fromIso: string, toIso: string): Promise<{ written: number; gapBefore: GapReport; outliersSkipped: number }> {
  const existing = await readCandles(tf, fromIso, toIso, 10000)
  const gapBefore = detectGaps(existing, tf, fromIso, toIso)
  const provider = await getBars(fromIso, INTERVAL_MAP[tf], tf === '1m' ? 'resolution' : 'resolution')
  const outliers = detectOutliers(provider.bars.map((b) => toRow(tf, b, provider.source)))
  const outlierSet = new Set(outliers.map((o) => o.ts_utc))
  const rows = provider.bars
    .map((b) => toRow(tf, b, provider.source))
    .filter((r) => !outlierSet.has(r.ts_utc) && new Date(r.ts_utc).getTime() <= new Date(toIso).getTime())
  const written = await upsertCandles(rows)
  return { written, gapBefore, outliersSkipped: outliers.length }
}

/** Convenience: backfill recent history for the standard ladder. */
export async function backfillStandardLadder(days = 7): Promise<Array<{ tf: StoredTf; written: number; gaps: number; outliersSkipped: number }>> {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  const results = []
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d'] as StoredTf[]) {
    // 1m for a week is ~10k bars — cap window for the heaviest tf.
    const tfFrom = tf === '1m' ? new Date(to.getTime() - 2 * 86_400_000) : from
    const r = await backfill(tf, tfFrom.toISOString(), to.toISOString())
    results.push({ tf, written: r.written, gaps: r.gapBefore.gaps.length, outliersSkipped: r.outliersSkipped })
  }
  return results
}

export async function storeFreshness(): Promise<Array<{ tf: string; latestTs: string | null; ageMinutes: number | null }>> {
  const out = []
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d'] as StoredTf[]) {
    const latest = await latestCandleTs(tf)
    out.push({
      tf,
      latestTs: latest,
      ageMinutes: latest ? Math.round((Date.now() - new Date(latest).getTime()) / 60_000) : null,
    })
  }
  return out
}
