// engine/honestStats — statistics that refuse to lie (v2 C3.3).
// Every rate ships with its sample size; small samples are flagged, win
// rate carries a Wilson 95% CI, expectancy is in R, and SQN follows
// Tharp's definition. No metric is returned without the N it was built on.

export const MIN_SAMPLE = 30

export interface WinRateHonest {
  wins: number
  n: number
  winRate: number | null // fraction 0..1, null when n=0
  ci95: { low: number; high: number } | null // Wilson score interval
  smallSample: boolean
}

/** Wilson score interval (no continuity correction), 95% by default. */
export function wilsonInterval(wins: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null
  const p = Math.min(Math.max(wins / n, 0), 1)
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

export function honestWinRate(wins: number, n: number): WinRateHonest {
  const clampedWins = Math.min(Math.max(wins, 0), n)
  return {
    wins: clampedWins,
    n,
    winRate: n > 0 ? clampedWins / n : null,
    ci95: wilsonInterval(clampedWins, n),
    smallSample: n < MIN_SAMPLE,
  }
}

/** One trade's result in R multiples (win pays +rr, loss pays −1). */
export interface RTrade {
  r: number
}

/** Mean R per trade. Null on empty input. */
export function expectancyR(trades: RTrade[]): number | null {
  if (trades.length === 0) return null
  const sum = trades.reduce((a, t) => a + t.r, 0)
  return sum / trades.length
}

/** Gross profit / gross loss (absolute). Null when no losses or empty. */
export function profitFactor(trades: RTrade[]): number | null {
  if (trades.length === 0) return null
  let gp = 0
  let gl = 0
  for (const t of trades) {
    if (t.r > 0) gp += t.r
    else gl += -t.r
  }
  if (gl === 0) return null // infinite PF is not a number we can print honestly
  return gp / gl
}

/** Tharp SQN: sqrt(n) * mean(R) / stddev(R). Sample stddev (n-1). */
export function sqn(trades: RTrade[]): number | null {
  const n = trades.length
  if (n < 2) return null
  const mean = trades.reduce((a, t) => a + t.r, 0) / n
  const variance = trades.reduce((a, t) => a + (t.r - mean) ** 2, 0) / (n - 1)
  const sd = Math.sqrt(variance)
  if (sd === 0) return null
  return Math.sqrt(n) * (mean / sd)
}

/** Annualised Sharpe on a daily R series (default 252 trading days). */
export function sharpeDaily(dailyR: number[], periodsPerYear = 252): number | null {
  const n = dailyR.length
  if (n < 2) return null
  const mean = dailyR.reduce((a, v) => a + v, 0) / n
  const variance = dailyR.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)
  const sd = Math.sqrt(variance)
  if (sd === 0) return null
  return (mean / sd) * Math.sqrt(periodsPerYear)
}

/** Sortino: downside deviation only (returns below target=0). */
export function sortinoDaily(dailyR: number[], periodsPerYear = 252): number | null {
  const n = dailyR.length
  if (n < 2) return null
  const mean = dailyR.reduce((a, v) => a + v, 0) / n
  const downside = dailyR.reduce((a, v) => a + Math.min(v, 0) ** 2, 0) / (n - 1)
  const dd = Math.sqrt(downside)
  if (dd === 0) return null
  return (mean / dd) * Math.sqrt(periodsPerYear)
}

export interface HonestTradeStats extends WinRateHonest {
  expectancyR: number | null
  profitFactor: number | null
  sqn: number | null
  avgWinR: number | null
  avgLossR: number | null
  maxConsecutiveLosses: number
}

/** Build R trades from outcome + the R:R the signal actually used. */
export function rTradesFromOutcomes(
  resolved: Array<{ outcome: 'tp_hit' | 'stopped_out'; rrUsed: number }>,
): RTrade[] {
  return resolved.map((s) => ({ r: s.outcome === 'tp_hit' ? s.rrUsed : -1 }))
}

export function honestTradeStats(trades: RTrade[]): HonestTradeStats {
  const wins = trades.filter((t) => t.r > 0)
  const losses = trades.filter((t) => t.r <= 0)
  const base = honestWinRate(wins.length, trades.length)
  let streak = 0
  let maxStreak = 0
  for (const t of trades) {
    if (t.r <= 0) {
      streak++
      if (streak > maxStreak) maxStreak = streak
    } else {
      streak = 0
    }
  }
  return {
    ...base,
    expectancyR: expectancyR(trades),
    profitFactor: profitFactor(trades),
    sqn: sqn(trades),
    avgWinR: wins.length ? wins.reduce((a, t) => a + t.r, 0) / wins.length : null,
    avgLossR: losses.length ? losses.reduce((a, t) => a + t.r, 0) / losses.length : null,
    maxConsecutiveLosses: maxStreak,
  }
}
