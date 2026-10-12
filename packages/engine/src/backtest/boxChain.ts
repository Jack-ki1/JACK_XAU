import type { Bar, BoxEvent } from './types';

export function computeBoxChain(bars: Bar[]): BoxEvent[] {
  const events: BoxEvent[] = []
  let state = 0
  let refHigh: number | null = null
  let refLow: number | null = null
  let rejHighCount = 0
  let rejLowCount = 0

  for (const bar of bars) {
    let csod = false
    let bos = false
    let breakoutDist: number | null = null

    if (refHigh == null || refLow == null) {
      refHigh = bar.high
      refLow = bar.low
      state = bar.close >= bar.open ? 1 : -1
      rejHighCount = 0
      rejLowCount = 0
    } else {
      const brokeUp = bar.close > refHigh
      const brokeDown = bar.close < refLow
      if (brokeUp || brokeDown) {
        const newState = brokeUp ? 1 : -1
        csod = newState !== state
        bos = newState === state
        breakoutDist = brokeUp ? bar.close - refHigh : refLow - bar.close
        refHigh = bar.high
        refLow = bar.low
        state = newState
        rejHighCount = 0
        rejLowCount = 0
      } else {
        if (bar.high > refHigh) rejHighCount++
        if (bar.low < refLow) rejLowCount++
      }
    }

    events.push({ time: bar.time, state, refHigh, refLow, csod, bos, rejHighCount, rejLowCount, breakoutDist })
  }
  return events
}

export function findAtOrBefore<T extends { time: string }>(events: T[], time: string): T | null {
  let lo = 0, hi = events.length - 1, result: T | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].time < time) {
      result = events[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}
