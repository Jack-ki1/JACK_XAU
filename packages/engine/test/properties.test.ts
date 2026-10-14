// Property-based tests (v2 F): invariants that must hold for ALL inputs.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calcPoints, POINT_SIZE } from '../src/points';
import { wilsonInterval, honestWinRate } from '../src/honestStats';
import { applyTransition, isTerminal, TERMINAL_STATES, type SignalState } from '../src/pipeline';
import { resolveWithMagnifier } from '../src/backtest/magnifier';

const price = fc.double({ min: 1000, max: 4000, noNaN: true, noDefaultInfinity: true });

describe('property: points', () => {
  it('calcPoints is symmetric and non-negative', () => {
    fc.assert(fc.property(price, price, (a, b) => {
      const ab = calcPoints(a, b);
      const ba = calcPoints(b, a);
      expect(ab).toBe(ba);
      expect(ab!).toBeGreaterThanOrEqual(0);
    }));
  });
  it('calcPoints(a,a) is 0', () => {
    fc.assert(fc.property(price, (a) => {
      expect(calcPoints(a, a)).toBe(0);
    }));
  });
  it('round-trips through POINT_SIZE within 1 point of exact distance', () => {
    fc.assert(fc.property(price, price, (a, b) => {
      const exact = Math.abs(a - b) / POINT_SIZE;
      expect(Math.abs(calcPoints(a, b)! - exact)).toBeLessThanOrEqual(0.5 + 1e-9);
    }));
  });
});

describe('property: wilson', () => {
  it('0 ≤ low ≤ p̂ ≤ high ≤ 1 whenever 0 ≤ wins ≤ n', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), (n, w) => {
      const wins = Math.min(w, n);
      const ci = wilsonInterval(wins, n);
      if (n === 0) {
        expect(ci).toBeNull();
        return;
      }
      const p = wins / n;
      const eps = 1e-9;
      expect(ci!.low).toBeLessThanOrEqual(p + eps);
      expect(ci!.high).toBeGreaterThanOrEqual(p - eps);
      expect(ci!.low).toBeGreaterThanOrEqual(0);
      expect(ci!.high).toBeLessThanOrEqual(1);
    }));
  });
  it('honestWinRate never returns out-of-range rates', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }), (n, w) => {
      const h = honestWinRate(w, n);
      if (n === 0) expect(h.winRate).toBeNull();
      else {
        expect(h.winRate!).toBeGreaterThanOrEqual(0);
        expect(h.winRate!).toBeLessThanOrEqual(1);
      }
      expect(h.smallSample).toBe(n < 30);
    }));
  });
});

describe('property: state machine', () => {
  const state = fc.constantFrom<SignalState>('created', 'open', 'tp1', 'tp2', 'tp3', 'closed', 'stopped', 'expired', 'cancelled');
  it('ok ⇒ from was non-terminal', () => {
    fc.assert(fc.property(state, state, (from, to) => {
      const r = applyTransition(from, to);
      if (r.ok) expect(isTerminal(from)).toBe(false);
    }));
  });
  it('terminal states never accept any transition', () => {
    fc.assert(fc.property(fc.constantFrom(...TERMINAL_STATES), state, (from, to) => {
      expect(applyTransition(from, to).ok).toBe(false);
    }));
  });
});

describe('property: magnifier', () => {
  const side = fc.constantFrom('buy' as const, 'sell' as const);
  it('outcome is always one of the declared set for random bars', () => {
    fc.assert(fc.property(
      side,
      price, price, price,
      fc.array(
        fc.record({
          time: fc.integer({ min: 0, max: 1000 }).map((i) => `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`),
          open: price,
          high: price,
          low: price,
          close: price,
        }),
        { minLength: 0, maxLength: 8 },
      ),
      (direction, a, b, c, rawBars) => {
        // Build a coherent SL/TP around a mid entry.
        const prices = [a, b, c].sort((x, y) => x - y);
        const entry = prices[1];
        const sl = direction === 'buy' ? entry - Math.abs(prices[0]) % 10 - 0.5 : entry + Math.abs(prices[0]) % 10 + 0.5;
        const tp = direction === 'buy' ? entry + Math.abs(prices[2]) % 10 + 0.5 : entry - Math.abs(prices[2]) % 10 - 0.5;
        // Normalise bar high/low ordering so fuzz stays sane.
        const m1 = rawBars.map((bar) => {
          const lo = Math.min(bar.open, bar.high, bar.low, bar.close);
          const hi = Math.max(bar.open, bar.high, bar.low, bar.close);
          return { ...bar, low: lo, high: hi };
        });
        const parent = { time: '2026-01-01T00:00:00Z', open: entry, high: entry, low: entry, close: entry };
        const r = resolveWithMagnifier({ direction, entry, sl, tp, parentBar: parent, m1 });
        expect(['tp_hit', 'stopped_out', 'ambiguous', 'none']).toContain(r.outcome);
      },
    ));
  });
});
