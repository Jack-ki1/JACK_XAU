// engine/analysis — PURE verdict/exit rule checks.
// Extracted (Phase 2) from lib/analysis/analyseSignal.ts. The LLM prompt +
// HTTP call live in the API provider layer; this module holds the
// deterministic parts: verdict normalization, allowed-RR ladders, and the
// preferred-exit recompute for `invalid` verdicts.

export const SNIPER_RR_LEVELS = [3, 4, 5, 6, 7, 8, 9, 10];
export const PRECISION_RR_LEVELS = [2, 3, 4];

export type Verdict = 'valid' | 'invalid';

export interface LlmVerdict {
  verdict: Verdict;
  reasoning?: string;
  preferred_rr?: number | null;
}

/** Coerce a raw LLM payload to the verdict contract (fail-closed to valid). */
export function normalizeVerdict(raw: unknown): LlmVerdict {
  if (typeof raw !== 'object' || raw === null) return { verdict: 'valid' };
  const r = raw as Record<string, unknown>;
  return {
    verdict: r.verdict === 'invalid' ? 'invalid' : 'valid',
    reasoning: typeof r.reasoning === 'string' ? r.reasoning : '',
    preferred_rr: typeof r.preferred_rr === 'number' ? r.preferred_rr : null,
  };
}

export function rrLevelsFor(signalType: string | null | undefined): number[] {
  return signalType === 'precision' ? PRECISION_RR_LEVELS : SNIPER_RR_LEVELS;
}

export interface PreferredExitInput {
  direction: string | null | undefined;
  entry: number | null | undefined;
  sl: number | null | undefined;
  verdict: Verdict;
  preferred_rr: number | null | undefined;
}

/**
 * Recompute TP from the LLM's preferred R:R rung, keeping Pine's own entry
 * and SL as the structural anchors (the model never gets an independent SL
 * basis). Returns nulls when inputs are missing — caller keeps Pine's TP.
 */
export function computePreferredExit(input: PreferredExitInput): { tp: number | null; rr: number | null } {
  const { direction, entry, sl, verdict, preferred_rr } = input;
  if (verdict !== 'invalid' || preferred_rr == null || entry == null || sl == null) {
    return { tp: null, rr: null };
  }
  const rr = Number(preferred_rr);
  if (!Number.isFinite(rr) || rr <= 0) return { tp: null, rr: null };
  const isBuy = direction === 'buy' || direction === 'long';
  const slDist = Math.abs(entry - sl);
  return { tp: isBuy ? entry + slDist * rr : entry - slDist * rr, rr };
}
