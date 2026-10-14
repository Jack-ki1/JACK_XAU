import { describe, it, expect } from 'vitest';
import {
  wilsonInterval,
  honestWinRate,
  expectancyR,
  profitFactor,
  sqn,
  sharpeDaily,
  sortinoDaily,
  rTradesFromOutcomes,
  honestTradeStats,
  MIN_SAMPLE,
} from '../src/honestStats';

describe('honest stats', () => {
  it('wilson interval contains p and stays within [0,1]', () => {
    const ci = wilsonInterval(62, 100)!;
    expect(ci.low).toBeLessThan(0.62);
    expect(ci.high).toBeGreaterThan(0.62);
    expect(ci.low).toBeGreaterThanOrEqual(0);
    expect(ci.high).toBeLessThanOrEqual(1);
  });
  it('wilson interval is wide on tiny samples', () => {
    const ci = wilsonInterval(1, 2)!;
    expect(ci.high - ci.low).toBeGreaterThan(0.4);
  });
  it('wilson returns null for n=0', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
  it('flags small samples below MIN_SAMPLE', () => {
    expect(honestWinRate(10, 20).smallSample).toBe(true);
    expect(honestWinRate(60, 100).smallSample).toBe(false);
    expect(MIN_SAMPLE).toBe(30);
  });
  it('clamps wins into [0,n]', () => {
    const h = honestWinRate(120, 100);
    expect(h.wins).toBe(100);
    expect(h.winRate).toBe(1);
  });
  it('expectancy in R', () => {
    expect(expectancyR([{ r: 3 }, { r: -1 }, { r: 3 }, { r: -1 }])).toBe(1);
    expect(expectancyR([])).toBeNull();
  });
  it('profit factor', () => {
    expect(profitFactor([{ r: 3 }, { r: 3 }, { r: -1 }, { r: -1 }])).toBe(3);
    expect(profitFactor([{ r: 2 }, { r: 2 }])).toBeNull(); // no losses → refuse infinite
  });
  it('sqn is null below 2 trades or zero variance', () => {
    expect(sqn([{ r: 1 }])).toBeNull();
    expect(sqn([{ r: 1 }, { r: 1 }, { r: 1 }])).toBeNull();
    expect(sqn([{ r: 2 }, { r: -1 }, { r: 2 }, { r: -1 }])).toBeGreaterThan(0);
  });
  it('sharpe/sortino need variance', () => {
    expect(sharpeDaily([1, 1, 1])).toBeNull();
    expect(sharpeDaily([1, -0.5, 2, -1])).not.toBeNull();
    expect(sortinoDaily([1, 0.5, -0.2, 1.5])).not.toBeNull();
  });
  it('rTradesFromOutcomes maps tp→+rr, stop→−1', () => {
    const t = rTradesFromOutcomes([
      { outcome: 'tp_hit', rrUsed: 4 },
      { outcome: 'stopped_out', rrUsed: 4 },
    ]);
    expect(t).toEqual([{ r: 4 }, { r: -1 }]);
  });
  it('honestTradeStats reports streaks and components', () => {
    const trades = rTradesFromOutcomes([
      { outcome: 'stopped_out', rrUsed: 3 },
      { outcome: 'stopped_out', rrUsed: 3 },
      { outcome: 'tp_hit', rrUsed: 3 },
      { outcome: 'stopped_out', rrUsed: 3 },
      { outcome: 'tp_hit', rrUsed: 3 },
    ]);
    const s = honestTradeStats(trades);
    expect(s.n).toBe(5);
    expect(s.wins).toBe(2);
    expect(s.maxConsecutiveLosses).toBe(2);
    expect(s.smallSample).toBe(true);
    expect(s.expectancyR).toBeCloseTo(3 / 5);
  });
});
