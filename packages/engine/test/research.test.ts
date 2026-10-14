import { describe, it, expect } from 'vitest';
import {
  monteCarlo,
  walkForwardFolds,
  walkForwardSummary,
  costAdjusted,
  costSummary,
} from '../src/research';
import { roundNumberLevels, nearestLevel, levelConfluence } from '../src/levels';

const sample = [0.5, -1, 1.5, -1, 2, -1, 0.5, -1, 1, 1.5, -1, 0.5];

describe('monteCarlo', () => {
  it('is deterministic for the same seed', () => {
    const a = monteCarlo(sample, { iterations: 500, seed: 7 });
    const b = monteCarlo(sample, { iterations: 500, seed: 7 });
    expect(a).toEqual(b);
  });
  it('differs across seeds but stays in a sane range', () => {
    const a = monteCarlo(sample, { iterations: 2000, seed: 1 });
    const b = monteCarlo(sample, { iterations: 2000, seed: 2 });
    expect(a.maxDrawdownR.worst).not.toBe(b.maxDrawdownR.worst);
    expect(a.finalR.p5).toBeLessThanOrEqual(a.finalR.p50);
    expect(a.finalR.p95).toBeGreaterThanOrEqual(a.finalR.p50);
    expect(a.maxDrawdownR.worst).toBeGreaterThanOrEqual(a.maxDrawdownR.p95);
    expect(a.ruinRate).toBeGreaterThanOrEqual(0);
    expect(a.ruinRate).toBeLessThanOrEqual(1);
  });
  it('median final equity tracks sample sum for small iteration counts', () => {
    const r = monteCarlo(sample, { iterations: 4000, seed: 42 });
    const sampleSum = sample.reduce((x, y) => x + y, 0);
    expect(r.finalR.p50).toBeCloseTo(sampleSum, 0);
    expect(r.winRate).toBeCloseTo(sample.filter((x) => x > 0).length / sample.length, 5);
  });
  it('handles empty input', () => {
    const r = monteCarlo([]);
    expect(r.finalR.p50).toBe(0);
    expect(r.ruinRate).toBe(0);
    expect(r.winRate).toBe(0);
  });
});

describe('walkForwardFolds', () => {
  const trades = Array.from({ length: 200 }, (_, i) => ({
    ts: 1_700_000_000_000 + i * 86_400_000,
    r: i % 3 === 0 ? -1 : 1.5,
  }));

  it('produces contiguous non-overlapping OOS windows with step=testSize', () => {
    const folds = walkForwardFolds(trades, { trainSize: 60, testSize: 20 });
    expect(folds.length).toBe(Math.floor((200 - 60) / 20));
    for (let i = 1; i < folds.length; i++) {
      expect(folds[i]!.testFrom).toBeGreaterThan(folds[i - 1]!.testTo);
    }
    expect(folds[0]!.trainTrades).toBe(60);
    expect(folds[0]!.testTrades).toBe(20);
    expect(folds[0]!.testFrom).toBeGreaterThan(folds[0]!.trainTo);
  });
  it('returns no folds when the sample is too small', () => {
    expect(walkForwardFolds(trades.slice(0, 50), { trainSize: 60, testSize: 20 })).toEqual([]);
  });
  it('sorts input defensively', () => {
    const shuffled = [...trades].reverse();
    const folds = walkForwardFolds(shuffled, { trainSize: 60, testSize: 20 });
    expect(folds[0]!.trainFrom).toBeLessThan(folds[0]!.trainTo);
  });
  it('summary reports degradation sign', () => {
    const folds = walkForwardFolds(trades, { trainSize: 60, testSize: 20 });
    const sum = walkForwardSummary(folds);
    expect(sum.folds).toBe(folds.length);
    expect(sum.degradation).toBeCloseTo(sum.meanTrainR - sum.meanTestR, 5);
    expect(walkForwardSummary([]).folds).toBe(0);
  });
});

describe('costs', () => {
  it('converts points to R and subtracts', () => {
    // 200pt stop, 6pt friction → 0.03R drag
    expect(costAdjusted({ grossR: 2, costPoints: 6, stopPoints: 200 })).toEqual({ netR: 2 - 0.03, costR: 0.03 });
  });
  it('passes through invalid stops', () => {
    expect(costAdjusted({ grossR: 1, costPoints: 5, stopPoints: 0 })).toEqual({ netR: 1, costR: 0 });
  });
  it('summarises and counts flips', () => {
    const s = costSummary([
      { grossR: 1.5, costPoints: 20, stopPoints: 100 }, // net 1.3
      { grossR: 0.1, costPoints: 20, stopPoints: 100 }, // net -0.1 → flipped
      { grossR: -1, costPoints: 20, stopPoints: 100 },
    ]);
    expect(s.trades).toBe(3);
    expect(s.flipped).toBe(1);
    expect(s.netTotalR).toBeCloseTo(1.3 - 0.1 - 1.2, 2);
    expect(s.meanCostR).toBeCloseTo(0.2, 3);
    expect(costSummary([]).trades).toBe(0);
  });
});

describe('level expansions', () => {
  it('rounds around price with step and radius', () => {
    const levels = roundNumberLevels(2607, { step: 10, radius: 2 });
    expect(levels).toEqual([2590, 2600, 2610, 2620, 2630]);
    expect(roundNumberLevels(2607, { step: 0, radius: 2 })).toEqual([]);
  });
  it('nearestLevel reports side and points', () => {
    const n = nearestLevel(2607.55, [2610, 2590, null]);
    expect(n).toEqual({ level: 2610, points: 245, side: 'above' });
    expect(nearestLevel(1, [])).toBeNull();
  });
  it('levelConfluence scores a tolerance band (points, 0.01 units)', () => {
    // $5 move = 500 points, $10 move = 1000 points
    const c = levelConfluence(2600, [2600, 2605, 2610, 2590], 600);
    expect(c.hits).toBe(2); // 2600 (0) + 2605 (500); 2610/2590 are 1000 away
    expect(c.score).toBeCloseTo(0.5, 5);
    expect(c.nearest?.level).toBe(2600);
    expect(levelConfluence(1, [null], 10).hits).toBe(0);
  });
});
