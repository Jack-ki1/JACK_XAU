// api/services/market — chart candles for the workspace. Live provider
// (Twelve Data resolution key) with a deterministic simulated fallback so
// the chart is usable without keys; response is always labelled.
import { fetchBarsSince, resolutionKey, type TdBar } from '../providers/twelveData.js';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const TF_MS: Record<Timeframe, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

export function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === 'string' && v in TF_MS;
}

// Deterministic pseudo-random walk (seeded by tf) around a plausible
// XAUUSD base — demo only, never mixed with live bars.
function simulatedBars(tf: Timeframe, bars: number): TdBar[] {
  const step = TF_MS[tf];
  const now = Math.floor(Date.now() / step) * step;
  let seed = 42 + tf.length * 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let price = 3350;
  const out: TdBar[] = [];
  for (let i = bars - 1; i >= 0; i--) {
    const drift = (rand() - 0.5) * 6;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + rand() * 2.5;
    const low = Math.min(open, close) - rand() * 2.5;
    out.push({
      time: new Date(now - i * step).toISOString().slice(0, 19).replace('T', ' '),
      open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2),
    });
    price = close;
  }
  return out;
}

export async function getCandles(tf: Timeframe, bars = 300): Promise<{
  bars: TdBar[];
  tf: Timeframe;
  source: 'twelvedata' | 'simulated';
}> {
  const capped = Math.min(Math.max(bars, 30), 500);
  const key = resolutionKey();
  if (key) {
    const from = new Date(Date.now() - TF_MS[tf] * capped * 2).toISOString();
    const live = await fetchBarsSince(from, tf, key);
    if (live.length > 0) return { bars: live.slice(-capped), tf, source: 'twelvedata' };
  }
  return { bars: simulatedBars(tf, capped), tf, source: 'simulated' };
}
