// engine/research — pure research-lab math (v2 P8): Monte Carlo over R
// sequences, walk-forward folds, and cost drag. Deterministic: PRNG is seeded
// (mulberry32) so every run with the same inputs gives identical results.
// No I/O, no Date.

export interface McOptions {
  iterations?: number;
  seed?: number;
  /** Equity peak-to-trough in R that counts as "ruined" (default 10R). */
  ruinThresholdR?: number;
}

export interface MonteCarloResult {
  iterations: number;
  finalR: { p5: number; p25: number; p50: number; p75: number; p95: number };
  maxDrawdownR: { p50: number; p95: number; worst: number };
  ruinRate: number; // fraction of paths with drawdown >= threshold
  winRate: number; // input sample win rate (sanity)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * Bootstrap-resample an R sequence into equity paths. Reports final equity
 * percentiles, max-drawdown distribution (in R from peak), and ruin rate.
 */
export function monteCarlo(rSequence: number[], options: McOptions = {}): MonteCarloResult {
  const iterations = Math.max(1, options.iterations ?? 2000);
  const seed = options.seed ?? 42;
  const ruinThreshold = options.ruinThresholdR ?? 10;
  const rnd = mulberry32(seed);
  const n = rSequence.length;

  if (n === 0) {
    return {
      iterations,
      finalR: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      maxDrawdownR: { p50: 0, p95: 0, worst: 0 },
      ruinRate: 0,
      winRate: 0,
    };
  }

  const finals: number[] = [];
  const drawdowns: number[] = [];
  let ruined = 0;

  for (let it = 0; it < iterations; it++) {
    let equity = 0;
    let peak = 0;
    let maxDd = 0;
    for (let i = 0; i < n; i++) {
      equity += rSequence[Math.floor(rnd() * n)]!;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDd) maxDd = dd;
    }
    finals.push(equity);
    drawdowns.push(maxDd);
    if (maxDd >= ruinThreshold) ruined++;
  }

  finals.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  const wins = rSequence.filter((r) => r > 0).length;

  return {
    iterations,
    finalR: {
      p5: percentile(finals, 5),
      p25: percentile(finals, 25),
      p50: percentile(finals, 50),
      p75: percentile(finals, 75),
      p95: percentile(finals, 95),
    },
    maxDrawdownR: {
      p50: percentile(drawdowns, 50),
      p95: percentile(drawdowns, 95),
      worst: drawdowns[drawdowns.length - 1] ?? 0,
    },
    ruinRate: ruined / iterations,
    winRate: wins / n,
  };
}

// ===== Walk-forward =====================================================

export interface DatedTrade {
  ts: number; // epoch ms
  r: number;
}

export interface WalkForwardFold {
  fold: number;
  trainFrom: number;
  trainTo: number;
  testFrom: number;
  testTo: number;
  trainTrades: number;
  testTrades: number;
  trainWinRate: number;
  testWinRate: number;
  trainExpectancyR: number;
  testExpectancyR: number;
}

export interface WalkForwardOptions {
  /** Training window length in trades (default 60). */
  trainSize?: number;
  /** Out-of-sample window length in trades (default 20). */
  testSize?: number;
  /** Step between folds in trades — defaults to testSize (contiguous OOS). */
  step?: number;
}

function winRateOf(rs: number[]): number {
  if (rs.length === 0) return 0;
  return rs.filter((r) => r > 0).length / rs.length;
}

function expectancyOf(rs: number[]): number {
  if (rs.length === 0) return 0;
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

/**
 * Anchored-style walk-forward over a chronological trade list: each fold
 * trains on a rolling window and tests on the next unseen slice. Trades must
 * be sorted by ts ascending (we sort defensively).
 */
export function walkForwardFolds(trades: DatedTrade[], options: WalkForwardOptions = {}): WalkForwardFold[] {
  const trainSize = Math.max(1, options.trainSize ?? 60);
  const testSize = Math.max(1, options.testSize ?? 20);
  const step = Math.max(1, options.step ?? testSize);
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const folds: WalkForwardFold[] = [];

  let start = 0;
  let fold = 1;
  while (start + trainSize + testSize <= sorted.length) {
    const train = sorted.slice(start, start + trainSize);
    const test = sorted.slice(start + trainSize, start + trainSize + testSize);
    const trainRs = train.map((t) => t.r);
    const testRs = test.map((t) => t.r);
    folds.push({
      fold: fold++,
      trainFrom: train[0]!.ts,
      trainTo: train[train.length - 1]!.ts,
      testFrom: test[0]!.ts,
      testTo: test[test.length - 1]!.ts,
      trainTrades: train.length,
      testTrades: test.length,
      trainWinRate: winRateOf(trainRs),
      testWinRate: winRateOf(testRs),
      trainExpectancyR: expectancyOf(trainRs),
      testExpectancyR: expectancyOf(testRs),
    });
    start += step;
  }
  return folds;
}

/** Aggregate OOS quality: mean test expectancy and train→test degradation. */
export function walkForwardSummary(folds: WalkForwardFold[]): {
  folds: number;
  meanTrainR: number;
  meanTestR: number;
  degradation: number; // meanTrainR - meanTestR (positive = overfit)
  oosWinRate: number;
} {
  if (folds.length === 0) return { folds: 0, meanTrainR: 0, meanTestR: 0, degradation: 0, oosWinRate: 0 };
  const meanTrainR = folds.reduce((a, f) => a + f.trainExpectancyR, 0) / folds.length;
  const meanTestR = folds.reduce((a, f) => a + f.testExpectancyR, 0) / folds.length;
  const testTrades = folds.reduce((a, f) => a + f.testTrades, 0);
  const oosWinRate = testTrades === 0 ? 0 : folds.reduce((a, f) => a + f.testWinRate * f.testTrades, 0) / testTrades;
  return { folds: folds.length, meanTrainR, meanTestR, degradation: meanTrainR - meanTestR, oosWinRate };
}

// ===== Costs ============================================================

export interface CostInput {
  grossR: number;
  /** Total round-trip friction in price points (spread + commission + slippage). */
  costPoints: number;
  /** Stop distance in points — converts points into R. */
  stopPoints: number;
}

export interface CostResult {
  netR: number;
  costR: number;
}

/** Drag a gross R result by execution costs. Invalid stops pass through. */
export function costAdjusted(input: CostInput): CostResult {
  if (!(input.stopPoints > 0)) return { netR: input.grossR, costR: 0 };
  const costR = input.costPoints / input.stopPoints;
  return { netR: input.grossR - costR, costR };
}

export interface CostSummary {
  trades: number;
  grossTotalR: number;
  netTotalR: number;
  costTotalR: number;
  meanCostR: number;
  /** Trades where costs flipped a winner into a loser. */
  flipped: number;
}

export function costSummary(trades: CostInput[]): CostSummary {
  let gross = 0;
  let net = 0;
  let cost = 0;
  let flipped = 0;
  for (const t of trades) {
    const r = costAdjusted(t);
    gross += t.grossR;
    net += r.netR;
    cost += r.costR;
    if (t.grossR > 0 && r.netR <= 0) flipped++;
  }
  return {
    trades: trades.length,
    grossTotalR: Math.round(gross * 100) / 100,
    netTotalR: Math.round(net * 100) / 100,
    costTotalR: Math.round(cost * 100) / 100,
    meanCostR: trades.length ? Math.round((cost / trades.length) * 1000) / 1000 : 0,
    flipped,
  };
}
