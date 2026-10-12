import { describe, it, expect } from 'vitest';
import { normalizeVerdict, rrLevelsFor, computePreferredExit, SNIPER_RR_LEVELS, PRECISION_RR_LEVELS } from '../src/analysis';

describe('normalizeVerdict', () => {
  it('passes valid through', () => {
    expect(normalizeVerdict({ verdict: 'valid', reasoning: 'ok' })).toEqual({ verdict: 'valid', reasoning: 'ok', preferred_rr: null });
  });
  it('fails closed to valid on garbage', () => {
    expect(normalizeVerdict(null).verdict).toBe('valid');
    expect(normalizeVerdict('nonsense').verdict).toBe('valid');
    expect(normalizeVerdict({ verdict: 'maybe' }).verdict).toBe('valid');
  });
});

describe('rrLevelsFor', () => {
  it('picks the precision ladder for precision signals', () => {
    expect(rrLevelsFor('precision')).toEqual(PRECISION_RR_LEVELS);
    expect(rrLevelsFor('sniper_confirmation')).toEqual(SNIPER_RR_LEVELS);
    expect(rrLevelsFor(null)).toEqual(SNIPER_RR_LEVELS);
  });
});

describe('computePreferredExit', () => {
  it('recomputes TP for invalid verdicts, anchoring entry+SL', () => {
    // buy: entry 2650, SL 2648 (200pt risk), RR 3 → TP 2656
    expect(computePreferredExit({ direction: 'buy', entry: 2650, sl: 2648, verdict: 'invalid', preferred_rr: 3 }))
      .toEqual({ tp: 2656, rr: 3 });
    // sell mirrors
    expect(computePreferredExit({ direction: 'sell', entry: 2650, sl: 2652, verdict: 'invalid', preferred_rr: 4 }))
      .toEqual({ tp: 2642, rr: 4 });
  });
  it('returns nulls for valid verdicts or missing inputs', () => {
    expect(computePreferredExit({ direction: 'buy', entry: 2650, sl: 2648, verdict: 'valid', preferred_rr: 3 }))
      .toEqual({ tp: null, rr: null });
    expect(computePreferredExit({ direction: 'buy', entry: null, sl: 2648, verdict: 'invalid', preferred_rr: 3 }))
      .toEqual({ tp: null, rr: null });
    expect(computePreferredExit({ direction: 'buy', entry: 2650, sl: 2648, verdict: 'invalid', preferred_rr: null }))
      .toEqual({ tp: null, rr: null });
  });
});
