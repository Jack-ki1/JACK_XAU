import { describe, it, expect } from 'vitest';
import { calcPoints, signalPointsSummary, POINT_SIZE } from '../src/points';

describe('points', () => {
  it('converts a $1.50 move to 150 points', () => {
    expect(POINT_SIZE).toBe(0.01);
    expect(calcPoints(2650.1, 2648.6)).toBe(150);
  });
  it('returns null for missing prices', () => {
    expect(calcPoints(null, 1)).toBeNull();
    expect(calcPoints(1, undefined)).toBeNull();
  });
  it('summarizes risk/reward for a signal', () => {
    const s = signalPointsSummary({ entry: 2650, stop_loss: 2648, tp_ladder: [{ price: 2656 }] });
    expect(s.riskPoints).toBe(200);
    expect(s.rewardPoints).toEqual([{ price: 2656, points: 600 }]);
    expect(s.rr).toBe(3);
  });
  it('handles an empty ladder', () => {
    const s = signalPointsSummary({ entry: 2650, stop_loss: 2648, tp_ladder: [] });
    expect(s.rr).toBeNull();
  });
});
