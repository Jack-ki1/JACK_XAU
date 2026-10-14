import { describe, it, expect } from 'vitest';
import { positionSize, exposureSummary, POINT_VALUE_PER_LOT } from '../src/risk';

describe('positionSize', () => {
  it('uses XAUUSD point value ($1/point/lot)', () => {
    expect(POINT_VALUE_PER_LOT).toBe(1);
  });
  it('sizes exactly for a round number', () => {
    // $10,000 equity, 1% → $100 risk; 200-point stop → $200/lot → 0.50 lot
    const r = positionSize({ equity: 10_000, riskPct: 1, entry: 2600, sl: 2598, direction: 'buy' });
    expect(r.stopPoints).toBe(200);
    expect(r.lots).toBe(0.5);
    expect(r.riskActual).toBe(100);
    expect(r.cappedBy).toBe('none');
  });
  it('rounds lots DOWN (never over-risks)', () => {
    const r = positionSize({ equity: 10_000, riskPct: 1, entry: 2600, sl: 2597.77, direction: 'buy' });
    expect(r.riskActual).toBeLessThanOrEqual(r.riskAmount);
    expect(r.lots).toBeLessThan(r.riskAmount / r.riskPerLot + 0.01);
  });
  it('caps at maxLots and warns', () => {
    const r = positionSize({ equity: 1_000_000, riskPct: 1, entry: 2600, sl: 2599.5, direction: 'sell', maxLots: 2 });
    expect(r.lots).toBe(2);
    expect(r.cappedBy).toBe('maxLots');
    expect(r.warnings.some((w) => w.includes('maxLots'))).toBe(true);
  });
  it('returns 0 lots with a warning when stop is too wide', () => {
    const r = positionSize({ equity: 100, riskPct: 1, entry: 2600, sl: 2500, direction: 'buy' });
    expect(r.lots).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('warns on zero stop and on equity <= 0', () => {
    expect(positionSize({ equity: 1000, riskPct: 1, entry: 2600, sl: 2600, direction: 'buy' }).lots).toBe(0);
    expect(positionSize({ equity: 0, riskPct: 1, entry: 2600, sl: 2599, direction: 'buy' }).lots).toBe(0);
  });
  it('flags risk above the 2% desk guideline', () => {
    const r = positionSize({ equity: 10_000, riskPct: 5, entry: 2600, sl: 2599, direction: 'buy' });
    expect(r.warnings.some((w) => w.includes('guideline'))).toBe(true);
  });
  it('is direction-agnostic (stop distance is absolute)', () => {
    const buy = positionSize({ equity: 10_000, riskPct: 1, entry: 2600, sl: 2598, direction: 'buy' });
    const sell = positionSize({ equity: 10_000, riskPct: 1, entry: 2598, sl: 2600, direction: 'sell' });
    expect(sell.lots).toBe(buy.lots);
    expect(sell.stopPoints).toBe(buy.stopPoints);
  });
});

describe('exposureSummary', () => {
  it('sums risk across open positions', () => {
    const r = exposureSummary({
      equity: 50_000,
      positions: [
        { lots: 1, direction: 'buy', entry: 2600, sl: 2598 }, // $200
        { lots: 0.5, direction: 'sell', entry: 2610, sl: 2614 }, // $200
      ],
    });
    expect(r.totalLots).toBe(1.5);
    expect(r.totalRiskAmount).toBe(400);
    expect(r.totalRiskPct).toBeCloseTo(0.8, 2);
    expect(r.netLots).toBe(0.5);
    expect(r.limitLotsBreached).toBe(false);
    expect(r.limitRiskBreached).toBe(false);
  });
  it('breaches limits with a warning list', () => {
    const r = exposureSummary({
      equity: 10_000,
      positions: [{ lots: 6, direction: 'buy', entry: 2600, sl: 2599 }],
      maxOpenLots: 5,
      maxRiskPct: 2,
    });
    expect(r.limitLotsBreached).toBe(true);
    expect(r.limitRiskBreached).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
  it('handles empty book', () => {
    const r = exposureSummary({ equity: 10_000, positions: [] });
    expect(r.totalLots).toBe(0);
    expect(r.totalRiskPct).toBe(0);
    expect(r.warnings).toEqual([]);
  });
});
