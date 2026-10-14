import { describe, it, expect } from 'vitest';
import { resolveWithMagnifier, type M1Bar } from '../src/backtest/magnifier';

const parent = { time: '2026-01-05T10:00:00Z', open: 2650, high: 2656, low: 2644, close: 2652 };
// buy @ 2650, SL 2645, TP 2655 — both inside parent → needs magnifier
const input = { direction: 'buy' as const, entry: 2650, sl: 2645, tp: 2655, parentBar: parent, m1: [] as M1Bar[] };

function m1(time: string, o: number, h: number, l: number, c: number): M1Bar {
  return { time, open: o, high: h, low: l, close: c };
}

describe('bar magnifier', () => {
  it('pessimistic fallback: ambiguous parent bar resolves as stopped_out', () => {
    const r = resolveWithMagnifier(input);
    expect(r.outcome).toBe('stopped_out');
    expect(r.barsUsed).toBe(0);
    expect(r.note).toContain('pessimistic');
  });
  it('optimistic option flips ambiguous parent to tp_hit', () => {
    const r = resolveWithMagnifier(input, { pessimistic: false });
    expect(r.outcome).toBe('tp_hit');
  });
  it('M1 decides when SL is hit first', () => {
    const m1s = [
      m1('2026-01-05T10:03:00Z', 2649, 2650.5, 2644.5, 2645),
      m1('2026-01-05T10:10:00Z', 2646, 2656, 2646, 2655.5),
    ];
    const r = resolveWithMagnifier({ ...input, m1: m1s });
    expect(r.outcome).toBe('stopped_out');
    expect(r.resolvedAt).toBe('2026-01-05T10:03:00Z');
    expect(r.barsUsed).toBeGreaterThan(0);
  });
  it('M1 decides when TP is hit first', () => {
    const m1s = [
      m1('2026-01-05T10:05:00Z', 2650, 2655.2, 2649, 2655),
      m1('2026-01-05T10:20:00Z', 2654, 2654.5, 2643, 2644),
    ];
    const r = resolveWithMagnifier({ ...input, m1: m1s });
    expect(r.outcome).toBe('tp_hit');
    expect(r.resolvedAt).toBe('2026-01-05T10:05:00Z');
  });
  it('same-M1-bar ambiguity is pessimistic by default', () => {
    const m1s = [m1('2026-01-05T10:07:00Z', 2650, 2656, 2644, 2651)];
    const r = resolveWithMagnifier({ ...input, m1: m1s });
    expect(r.outcome).toBe('stopped_out');
    expect(r.note).toContain('pessimistic');
  });
  it('gap through TP fills at the bar open', () => {
    const m1s = [m1('2026-01-05T10:01:00Z', 2657, 2658, 2656.5, 2657.5)]; // opens above TP
    const r = resolveWithMagnifier({ ...input, m1: m1s });
    expect(r.outcome).toBe('tp_hit');
    expect(r.gapFill).toBe(true);
    expect(r.fillPrice).toBe(2657);
  });
  it('gap through SL fills at the bar open (sell: gap down through stop)', () => {
    const sell = { direction: 'sell' as const, entry: 2650, sl: 2655, tp: 2644, parentBar: parent, m1: [
      m1('2026-01-05T10:02:00Z', 2653, 2653.5, 2652.5, 2653),
      m1('2026-01-05T10:04:00Z', 2656.5, 2657, 2656, 2656.8), // opens above SL
    ] };
    const r = resolveWithMagnifier(sell);
    expect(r.outcome).toBe('stopped_out');
    expect(r.gapFill).toBe(true);
    expect(r.fillPrice).toBe(2656.5);
  });
  it('returns none when neither level is touched', () => {
    const m1s = [m1('2026-01-05T10:03:00Z', 2650, 2652, 2648, 2651)];
    const r = resolveWithMagnifier({ ...input, m1: m1s });
    expect(r.outcome).toBe('none');
  });
  it('rejects invalid SL/TP placement', () => {
    const r = resolveWithMagnifier({ ...input, sl: 2655, tp: 2645 });
    expect(r.outcome).toBe('none');
    expect(r.note).toContain('Invalid');
  });
  it('walks M1 in ascending time (out-of-order input still works by first-hit-time comparison)', () => {
    const m1s = [
      m1('2026-01-05T10:15:00Z', 2648, 2655.5, 2647, 2655), // TP later
      m1('2026-01-05T10:05:00Z', 2649, 2650, 2644.2, 2645), // SL earlier
    ];
    const r = resolveWithMagnifier({ ...input, m1: m1s });
    expect(r.outcome).toBe('stopped_out'); // earliest recorded time wins
  });
});
