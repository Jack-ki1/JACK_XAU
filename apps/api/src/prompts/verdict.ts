// api/prompts/verdict — versioned LLM prompts. Every prompt change bumps its
// version constant so ai_runs rows stay attributable (audit trail v2 C9.2).
// Callers must log { prompt_version, model, input_snapshot, output, latency_ms,
// tokens } into ai_runs for each run, success or failure.
import { rrLevelsFor } from '@jack-trade/engine';
import type { SignalRow } from '@jack-trade/shared';

export const VERDICT_PROMPT_VERSION = '2026-10-09.verdict.v2';
export const NEWS_PROMPT_VERSION = '2026-10-09.news.v1';

export function buildVerdictPrompt(sig: SignalRow, movement: string, calendar: string): string {
  const rrLevels = rrLevelsFor(sig.signal_type);
  return `You are reviewing a trading signal from JACK TRADE's own XAUUSD strategy. Judge whether THIS signal genuinely satisfies the strategy's own rules -- do not apply a different technical analysis framework.

Signal:
- Type: ${sig.signal_type}${sig.path ? ' (' + sig.path + ')' : ''}
- Direction: ${sig.direction}
- Entry: ${sig.entry}
- Grade: ${sig.grade?.value}/${sig.grade?.of} timeframes in agreement
- Pine's own chosen exit: SL ${sig.exits?.sl}, TP ${sig.exits?.tp}, R:R 1:${sig.risk?.tp_rr ?? sig.exits?.rr_selected}
- HTF confluence: ${JSON.stringify(sig.htf_confluence ?? [])}
- Manual entry filter (Precision only): ${JSON.stringify(sig.manual_entry_filter ?? {})}

${movement}

${calendar}

Judge validity based on: does the grade and HTF confluence genuinely support this signal type firing, does the live price movement above still support this direction, and is there imminent news risk? For Precision, does the manual filter show real strength (most conditions true), or is this thin?

IMPORTANT CONSTRAINT on any alternate level you suggest: you do NOT have access to raw structural price data (box highs/lows) beyond what's given above -- Pine's own chosen SL (${sig.exits?.sl}) is the only genuinely real structural reference available to you. If you judge this signal invalid, do NOT invent a different SL price. Instead, only suggest a DIFFERENT R:R ratio from this exact allowed list: [${rrLevels.join(', ')}] -- pick a smaller (more conservative) ratio if the signal looks weak, keeping Pine's own SL and entry unchanged.

Respond with ONLY this JSON, no other text, no markdown fences:
{"verdict": "valid" or "invalid", "reasoning": "1-2 sentences, referencing specific grade/confluence/filter values above", "preferred_rr": <one number from the allowed list above, or null if valid>}`;
}

export function buildNewsPrompt(sig: SignalRow, eventLabel: string, newsText: string): string {
  const rrLevels = rrLevelsFor(sig.signal_type);
  return `A high-impact economic event is active right now: ${eventLabel}. This is happening DURING or immediately around this signal firing.

Recent relevant news headlines:
${newsText || 'No headlines available this check -- weight the event itself heavily regardless.'}

Trading signal from JACK TRADE's own XAUUSD strategy, fired during this news window:
- Direction: ${sig.direction}
- Entry: ${sig.entry}
- Pine's own chosen exit: SL ${sig.exits?.sl}, TP ${sig.exits?.tp}, R:R 1:${sig.risk?.tp_rr ?? sig.exits?.rr_selected}
- Grade: ${sig.grade?.value}/${sig.grade?.of} timeframes in agreement

WEIGHT THE NEWS AND EVENT ABOVE AS PRIMARY -- this is different from a normal technical check. Ask first: does the news/event content support or contradict this ${sig.direction} direction? Only use the grade/technical data as secondary, confirming context, not the main basis for your verdict.

IMPORTANT CONSTRAINT: you do not have raw structural price data beyond what's given -- Pine's own SL (${sig.exits?.sl}) is the only genuine structural reference available. If invalid, do NOT invent a different SL. Only suggest a different R:R ratio from this list: [${rrLevels.join(', ')}], more conservative if the news creates real uncertainty.

Respond with ONLY this JSON, no other text:
{"verdict": "valid" or "invalid", "reasoning": "1-2 sentences, referencing the specific news/event and how it relates to this direction", "preferred_rr": <one number from the list, or null if valid>}`;
}
