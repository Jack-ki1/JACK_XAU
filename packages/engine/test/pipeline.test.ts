import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  canTransition,
  isTerminal,
  ladderPath,
  projectToRow,
  stateFromRow,
  TERMINAL_STATES,
  type SignalState,
} from '../src/pipeline';

const ALL: SignalState[] = ['created', 'open', 'tp1', 'tp2', 'tp3', 'closed', 'stopped', 'expired', 'cancelled'];

describe('signal state machine', () => {
  it('allows the happy ladder path', () => {
    expect(applyTransition('created', 'open').ok).toBe(true);
    expect(applyTransition('open', 'tp1').ok).toBe(true);
    expect(applyTransition('tp1', 'tp2').ok).toBe(true);
    expect(applyTransition('tp2', 'tp3').ok).toBe(true);
    expect(applyTransition('tp3', 'closed').ok).toBe(true);
  });
  it('allows direct open → closed (single-candle full TP)', () => {
    expect(canTransition('open', 'closed')).toBe(true);
  });
  it('rejects ladder skips', () => {
    expect(applyTransition('open', 'tp2').ok).toBe(false);
    expect(applyTransition('tp1', 'tp3').ok).toBe(false);
    expect(applyTransition('created', 'tp1').ok).toBe(false);
  });
  it('rejects every move out of a terminal state', () => {
    for (const t of TERMINAL_STATES) {
      expect(isTerminal(t)).toBe(true);
      for (const to of ALL) {
        expect(applyTransition(t, to).ok).toBe(false);
      }
    }
  });
  it('rejects reverse ladder moves', () => {
    expect(applyTransition('tp2', 'tp1').ok).toBe(false);
    expect(applyTransition('closed', 'open').ok).toBe(false);
  });
  it('allows stop/expiry/cancel from any OPEN-ish state; created only expires/cancels', () => {
    for (const from of ['open', 'tp1', 'tp2', 'tp3'] as SignalState[]) {
      expect(applyTransition(from, 'stopped').ok).toBe(true);
      expect(applyTransition(from, 'expired').ok).toBe(true);
      expect(applyTransition(from, 'cancelled').ok).toBe(true);
    }
    // A never-opened signal cannot be "stopped out" — no entry was live.
    expect(applyTransition('created', 'stopped').ok).toBe(false);
    expect(applyTransition('created', 'expired').ok).toBe(true);
    expect(applyTransition('created', 'cancelled').ok).toBe(true);
  });
  it('rejects created → tp1, open → tp3', () => {
    expect(canTransition('created', 'tp1')).toBe(false);
    expect(canTransition('open', 'tp3')).toBe(false);
  });
  it('ladderPath walks to the target rung (inclusive, no terminal step)', () => {
    expect(ladderPath('none')).toEqual(['created', 'open', 'closed']);
    expect(ladderPath('tp2')).toEqual(['created', 'open', 'tp1', 'tp2']);
    expect(ladderPath('tp3')).toEqual(['created', 'open', 'tp1', 'tp2', 'tp3']);
  });
  it('projects states onto the legacy row shape', () => {
    expect(projectToRow('open')).toEqual({ status: 'open', final_outcome: null, ladder: 'none' });
    expect(projectToRow('tp2')).toEqual({ status: 'open', final_outcome: null, ladder: 'tp2' });
    expect(projectToRow('closed')).toEqual({ status: 'closed', final_outcome: 'tp_hit', ladder: 'tp3' });
    expect(projectToRow('stopped')).toEqual({ status: 'closed', final_outcome: 'stopped_out', ladder: 'none' });
    expect(projectToRow('cancelled')).toEqual({ status: 'closed', final_outcome: null, ladder: 'none' });
  });
  it('round-trips rows back to states', () => {
    expect(stateFromRow({ status: 'open', final_outcome: null })).toBe('open');
    expect(stateFromRow({ status: 'open', final_outcome: null, ladder: 'tp1' })).toBe('tp1');
    expect(stateFromRow({ status: 'closed', final_outcome: 'tp_hit' })).toBe('closed');
    expect(stateFromRow({ status: 'closed', final_outcome: 'stopped_out' })).toBe('stopped');
    expect(stateFromRow({ status: 'closed', final_outcome: null })).toBe('expired');
  });
});
