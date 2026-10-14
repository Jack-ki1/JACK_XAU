// engine/backtest/magnifier — PURE M1 intrabar outcome resolution (v2 C2.4).
// TradingView "Bar Magnifier" idea: when SL and TP both sit inside one
// execution-TF candle, decide the winner with M1 bars instead of guessing.
// Gap rule: if a bar OPENS beyond the level, the fill is the bar open
// (TradingView emulator semantics), not the stated level. If M1 is also
// ambiguous, the caller chooses the pessimistic rule (default: stop wins).

import type { Bar } from './types'

export interface M1Bar {
  time: string // ISO, bar OPEN time
  open: number
  high: number
  low: number
  close: number
}

export interface MagnifierInput {
  direction: 'buy' | 'sell'
  entry: number
  sl: number
  tp: number
  /** Execution-TF bar that produced the ambiguity (or the resolution bar). */
  parentBar: Pick<Bar, 'time' | 'open' | 'high' | 'low' | 'close'>
  /** M1 bars overlapping parentBar's window, ascending. May be empty. */
  m1: M1Bar[]
}

export interface MagnifierOptions {
  /** When both SL and TP are hit inside one M1 bar (or the parent bar with no M1): stop wins if true (default). */
  pessimistic?: boolean
}

export interface MagnifierResult {
  outcome: 'tp_hit' | 'stopped_out' | 'ambiguous' | 'none'
  resolvedAt: string | null
  fillPrice: number | null
  /** How many M1 bars were actually walked (0 = parent-bar fallback). */
  barsUsed: number
  /** Set when the fill is a gap fill at bar open, not the stated level. */
  gapFill: boolean
  note?: string
}

function hitLow(low: number, level: number): boolean {
  return low <= level
}
function hitHigh(high: number, level: number): boolean {
  return high >= level
}

/**
 * Resolve an open trade against M1 detail. Returns 'none' when neither
 * level was touched by the provided bars (caller should keep waiting).
 */
export function resolveWithMagnifier(input: MagnifierInput, opts: MagnifierOptions = {}): MagnifierResult {
  const pessimistic = opts.pessimistic ?? true
  const { direction, entry, sl, tp, parentBar, m1 } = input
  const isBuy = direction === 'buy'

  // Sanity: SL and TP must sit on opposite sides of entry.
  const slSideOk = isBuy ? sl < entry : sl > entry
  const tpSideOk = isBuy ? tp > entry : tp < entry
  if (!slSideOk || !tpSideOk) {
    return { outcome: 'none', resolvedAt: null, fillPrice: null, barsUsed: 0, gapFill: false, note: 'Invalid SL/TP placement for direction.' }
  }

  const walk = m1.length > 0 ? m1 : [parentBar]
  let sawSl = false
  let sawTp = false
  let slAt: { time: string; price: number; gap: boolean } | null = null
  let tpAt: { time: string; price: number; gap: boolean } | null = null

  for (const bar of walk) {
    const { open, high, low } = bar
    // Touch rules: a lower level is crossed when the bar LOW reaches it,
    // an upper level when the bar HIGH reaches it. A gap OPEN beyond the
    // level is inside the high/low range for valid bars, so it registers
    // as a hit and we fill at the open below.
    const slHit = isBuy ? hitLow(low, sl) : hitHigh(high, sl)
    const tpHit = isBuy ? hitHigh(high, tp) : hitLow(low, tp)
    if (slHit && !sawSl) {
      const gap = isBuy ? open < sl : open > sl
      sawSl = true
      slAt = { time: bar.time, price: gap ? open : sl, gap }
    }
    if (tpHit && !sawTp) {
      const gap = isBuy ? open > tp : open < tp
      sawTp = true
      tpAt = { time: bar.time, price: gap ? open : tp, gap }
    }
    if (sawSl && sawTp) break
  }

  const barsUsed = m1.length > 0 ? walk.length : 0
  const m1Note = m1.length === 0 ? ' No M1 bars supplied — parent-bar fallback.' : ''

  if (sawSl && sawTp) {
    // Same bar? (last walk step touched both, or both recorded on same time)
    const sameBar = slAt!.time === tpAt!.time
    if (sameBar) {
      if (pessimistic) {
        return {
          outcome: 'stopped_out',
          resolvedAt: slAt!.time,
          fillPrice: slAt!.price,
          barsUsed,
          gapFill: slAt!.gap,
          note: `SL and TP inside one bar; pessimistic rule applied (stop wins).${m1Note}`,
        }
      }
      return {
        outcome: 'tp_hit',
        resolvedAt: tpAt!.time,
        fillPrice: tpAt!.price,
        barsUsed,
        gapFill: tpAt!.gap,
        note: `SL and TP inside one bar; optimistic rule applied (target wins).${m1Note}`,
      }
    }
    // Different bars: whichever was recorded first wins.
    const slFirst = slAt!.time < tpAt!.time
    const win = slFirst ? slAt! : tpAt!
    return {
      outcome: slFirst ? 'stopped_out' : 'tp_hit',
      resolvedAt: win.time,
      fillPrice: win.price,
      barsUsed,
      gapFill: win.gap,
      note: win.gap ? 'Gap fill at bar open.' : undefined,
    }
  }

  if (sawSl) {
    return {
      outcome: 'stopped_out',
      resolvedAt: slAt!.time,
      fillPrice: slAt!.price,
      barsUsed,
      gapFill: slAt!.gap,
      note: slAt!.gap ? 'Gap fill at bar open.' : undefined,
    }
  }
  if (sawTp) {
    return {
      outcome: 'tp_hit',
      resolvedAt: tpAt!.time,
      fillPrice: tpAt!.price,
      barsUsed,
      gapFill: tpAt!.gap,
      note: tpAt!.gap ? 'Gap fill at bar open.' : undefined,
    }
  }
  return { outcome: 'none', resolvedAt: null, fillPrice: null, barsUsed, gapFill: false }
}
