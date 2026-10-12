import { POINT_VALUE } from './types';
import type { Bar, BacktestParams } from './types';

export function walkForOutcome(
  bars1m: Bar[],
  fromIdx: number,
  direction: 'buy' | 'sell',
  sl: number,
  tp: number
): { outcome: 'tp_hit' | 'stopped_out' | 'still_open'; resolvedAt: string | null; barsToResolve: number | null } {
  for (let i = fromIdx + 1; i < bars1m.length; i++) {
    const bar = bars1m[i]
    const slTouched = direction === 'buy' ? bar.low <= sl : bar.high >= sl
    const tpTouched = direction === 'buy' ? bar.high >= tp : bar.low <= tp

    if (slTouched && tpTouched) {
      // STAGE FIX: real bug found -- this used to always report SL
      // first whenever both were touched in the same bar, regardless
      // of which genuinely happened first, systematically biasing
      // every past backtest win rate downward. Same defensible
      // tie-break as the live resolvers: whichever level sits closer
      // to the bar's own open is more likely to have been reached
      // first.
      const distToSL = Math.abs(bar.open - sl)
      const distToTP = Math.abs(bar.open - tp)
      if (distToTP < distToSL) {
        return { outcome: 'tp_hit', resolvedAt: bar.time, barsToResolve: i - fromIdx }
      }
      return { outcome: 'stopped_out', resolvedAt: bar.time, barsToResolve: i - fromIdx }
    }
    if (slTouched) return { outcome: 'stopped_out', resolvedAt: bar.time, barsToResolve: i - fromIdx }
    if (tpTouched) return { outcome: 'tp_hit', resolvedAt: bar.time, barsToResolve: i - fromIdx }
  }
  return { outcome: 'still_open', resolvedAt: null, barsToResolve: null }
}

// STAGE SYNC: replaces BOTH calcExitsHtfSourced and calcExitsMidpointSourced.
// BRUVV's Stage 26 unification: SL is ALWAYS anchored to the 15m box +
// protected swing, regardless of which HTF sourced the signal or
// which setup fired -- matches f_calcSL exactly.
export function calcSL(
  direction: 'buy' | 'sell', entryPrice: number,
  h15: number, l15: number,
  protSwingHigh: number | null, protSwingLow: number | null,
  params: BacktestParams
): number {
  const price = entryPrice
  const maxSLDistance = params.maxSLPoints * POINT_VALUE
  const slBufferUnits = params.slBufferPointsFlat * POINT_VALUE

  const boxEdge = direction === 'sell' ? h15 : l15
  const swingRef = direction === 'sell' ? protSwingHigh : protSwingLow

  const rawSL = direction === 'sell'
    ? (swingRef != null && swingRef < boxEdge && swingRef > price ? swingRef : boxEdge)
    : (swingRef != null && swingRef > boxEdge && swingRef < price ? swingRef : boxEdge)

  const bufferedSL = direction === 'sell' ? rawSL + slBufferUnits : rawSL - slBufferUnits
  const slOnCorrectSide = direction === 'sell' ? bufferedSL > price : bufferedSL < price

  return direction === 'sell'
    ? (slOnCorrectSide ? Math.min(bufferedSL, price + maxSLDistance) : price + maxSLDistance)
    : (slOnCorrectSide ? Math.max(bufferedSL, price - maxSLDistance) : price - maxSLDistance)
}

// STAGE SYNC: new -- matches f_pickNearestRR exactly. Looks at every
// real structural level (HTF box edges + protected swing) that sits
// beyond entry in the trade's favor, finds the nearest one, converts
// to an R:R given this signal's actual SL distance, and snaps to
// whichever ALLOWED ratio in rrLevels is closest -- never an
// arbitrary pick. Falls back to the minimum ratio if nothing valid.
export function pickNearestRR(
  direction: 'buy' | 'sell', entryPrice: number, sl: number,
  candidates: (number | null)[], rrLevels: number[]
): number {
  const riskDist = Math.abs(entryPrice - sl)
  let bestDist: number | null = null

  if (riskDist > 0) {
    for (const lvl of candidates) {
      if (lvl == null) continue
      const dist = direction === 'sell' ? entryPrice - lvl : lvl - entryPrice
      if (dist > riskDist) {
        if (bestDist == null || dist < bestDist) bestDist = dist
      }
    }
  }

  const minRR = rrLevels[0]
  if (bestDist == null || riskDist <= 0) return minRR

  const targetRRRaw = bestDist / riskDist
  let closest = minRR
  let bestGap: number | null = null
  for (const rr of rrLevels) {
    const gap = Math.abs(rr - targetRRRaw)
    if (bestGap == null || gap < bestGap) {
      bestGap = gap
      closest = rr
    }
  }
  return closest
}

export function buildSingleTP(direction: 'buy' | 'sell', entryPrice: number, sl: number, rr: number): number {
  const riskDist = Math.abs(entryPrice - sl)
  return direction === 'sell' ? entryPrice - riskDist * rr : entryPrice + riskDist * rr
}
