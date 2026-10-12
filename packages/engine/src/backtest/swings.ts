import type { Bar } from './types';

export function computeProtectedSwing(bars: Bar[], len: number): { time: string; protHigh: number | null; protLow: number | null }[] {
  const out: { time: string; protHigh: number | null; protLow: number | null }[] = []
  let protHigh: number | null = null
  let protLow: number | null = null

  for (let i = 0; i < bars.length; i++) {
    const pivotIdx = i - len
    if (pivotIdx >= len) {
      const window = bars.slice(pivotIdx - len, pivotIdx + len + 1)
      const centerBar = bars[pivotIdx]
      const isHigh = window.every(b => b.high <= centerBar.high) && window.filter(b => b.high === centerBar.high).length === 1
      const isLow = window.every(b => b.low >= centerBar.low) && window.filter(b => b.low === centerBar.low).length === 1
      if (isHigh) protHigh = centerBar.high
      if (isLow) protLow = centerBar.low
    }

    const c = bars[i].close
    if (protHigh != null && c > protHigh) protHigh = null
    if (protLow != null && c < protLow) protLow = null

    out.push({ time: bars[i].time, protHigh, protLow })
  }
  return out
}
