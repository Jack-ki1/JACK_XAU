import { describe, it, expect } from 'vitest';
import {
  computeBoxChain, walkForOutcome, runBacktest, summarize, DEFAULT_PARAMS,
  type Bar, type BarsByTF,
} from '../src/backtest';

/** Deterministic synthetic bars: flat base, sharp displacement, trend. */
function makeBars(n: number, start = 2600): Bar[] {
  const bars: Bar[] = [];
  const t0 = new Date('2026-09-01T00:00:00Z').getTime();
  for (let i = 0; i < n; i++) {
    // phases: 0-99 flat, 100-199 grind up, 200+ trend up with noise-free steps
    const drift = i < 100 ? 0 : i < 200 ? (i - 100) * 0.05 : 5 + (i - 200) * 0.1;
    const o = start + drift;
    bars.push({
      time: new Date(t0 + i * 60000).toISOString(),
      open: o, high: o + 0.15, low: o - 0.15, close: o + 0.05,
    });
  }
  return bars;
}

function multiTF(oneMin: Bar[]): BarsByTF {
  // Engine tolerates shared arrays across TFs for smoke purposes.
  return {
    '1': oneMin, '3': oneMin, '5': oneMin, '15': oneMin, '60': oneMin,
    '240': oneMin, 'D': oneMin, 'W': oneMin, 'M': oneMin, '12M': oneMin,
  };
}

describe('computeBoxChain', () => {
  it('starts neutral then tracks bias and breakouts', () => {
    const bars = makeBars(10);
    const chain = computeBoxChain(bars);
    expect(chain).toHaveLength(10);
    expect(chain[0].refHigh).toBeGreaterThan(chain[0].refLow!);
    // flat open: no csod on bar 0
    expect(chain[0].csod).toBe(false);
  });
  it('flags a close outside the box as csod/bos with distance', () => {
    const bars: Bar[] = [
      { time: '2026-09-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100.5 },
      { time: '2026-09-01T00:01:00Z', open: 100.5, high: 102, low: 100, close: 101.5 }, // close > refHigh 101
    ];
    const chain = computeBoxChain(bars);
    // Same-direction continuation is BOS, not CSOD (csod = direction change).
    expect(chain[1].bos).toBe(true);
    expect(chain[1].csod).toBe(false);
    expect(chain[1].breakoutDist).toBeCloseTo(0.5, 5);
  });
});

describe('walkForOutcome', () => {
  const bars: Bar[] = [
    { time: 't0', open: 100, high: 101, low: 99, close: 100 },
    { time: 't1', open: 100, high: 105, low: 99.5, close: 104 },
  ];
  it('hits TP for a buy', () => {
    expect(walkForOutcome(bars, 0, 'buy', 98, 103).outcome).toBe('tp_hit');
  });
  it('stays open when untouched', () => {
    expect(walkForOutcome(bars, 0, 'buy', 90, 200).outcome).toBe('still_open');
  });
  it('breaks same-bar ties toward the closer level', () => {
    // bar t1 touches both SL 99.6 and TP 104.5; open 100 is closer to SL.
    const r = walkForOutcome(bars, 0, 'buy', 99.6, 104.5);
    expect(r.outcome).toBe('stopped_out');
  });
});

describe('runBacktest (golden)', () => {
  it('is deterministic: same input, same output', () => {
    const bars = multiTF(makeBars(400));
    const a = runBacktest(bars, DEFAULT_PARAMS);
    const b = runBacktest(bars, DEFAULT_PARAMS);
    expect(a.signals).toEqual(b.signals);
    expect(a.diagnostics).toEqual(b.diagnostics);
  });
  it('matches the committed golden summary', async () => {
    const bars = multiTF(makeBars(400));
    const { signals } = runBacktest(bars, DEFAULT_PARAMS);
    const summary = summarize(signals);
    await expect(summary).toMatchFileSnapshot(__dirname + '/__snapshots__/backtest-summary.json');
  });
});
