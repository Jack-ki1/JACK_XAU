// api/services/analysis — LLM verdict pipeline (Groq) + deterministic guards.
// Ports analyseOneSignal + both trigger paths. Engine owns verdict/RR math;
// providers/llm owns the HTTP call; this service owns quota/dedup/insert.
// Every run (success or failure) is appended to ai_runs (v2 C9.2 audit trail).
import { computePreferredExit } from '@jack-trade/engine';
import type { SignalRow } from '@jack-trade/shared';
import { getEnv } from '../config/env.js';
import { completeVerdict, modelName } from '../providers/llm.js';
import { analysisKey } from '../providers/twelveData.js';
import { buildVerdictPrompt, VERDICT_PROMPT_VERSION } from '../prompts/verdict.js';
import { getDb } from '../repositories/client.js';
import { bumpUsage, calendarWindow, getSetting, getUsage, highImpact, insertAiRun } from '../repositories/repos.js';
import { publish } from '../plugins/sse.js';

export const DAILY_LIMIT = 1000;
const KEY_NAME = 'analysed_signals';
const NEWS_KEY_NAME = 'news_signals';

async function priceContext(entry: number | null | undefined, direction: string | null | undefined): Promise<string> {
  const bars = await (async () => {
    const key = analysisKey();
    if (!key) return null;
    try {
      const used = await getUsage('av_usage', 'analysed_signals');
      if (used >= 800) return null;
      const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=15&apikey=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data: Record<string, unknown> = (await res.json()) as Record<string, unknown>;
      await bumpUsage('av_usage', 'analysed_signals', 1);
      if (data?.status === 'error' || !Array.isArray(data?.values) || data.values.length === 0) return null;
      type B = { datetime: string; high: string | number; low: string | number; close: string | number };
      const sorted = (data.values as B[])
        .map((v) => ({ time: v.datetime, high: parseFloat(String(v.high)), low: parseFloat(String(v.low)), close: parseFloat(String(v.close)) }))
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      const current = sorted[sorted.length - 1].close;
      const oldest = sorted[0].close;
      const range = Math.max(...sorted.map((b) => b.high)) - Math.min(...sorted.map((b) => b.low));
      const rangePts = Math.round(range / 0.01);
      const netPts = Math.round(Math.abs(current - oldest) / 0.01);
      const eff = rangePts > 0 ? netPts / rangePts : 0;
      const chop = eff > 0.7 ? 'a clean, directional trend' : eff < 0.35 ? 'choppy/ranging conditions' : 'moderately directional conditions';
      return { current, chop, netPts, rangePts, dir: current > oldest ? 'up' : current < oldest ? 'down' : 'flat' };
    } catch {
      return null;
    }
  })();
  if (!bars || entry == null) return 'Live price unavailable for this check -- judge on the signal data alone.';
  const isBuy = direction === 'buy' || direction === 'long';
  const delta = bars.current - entry;
  const inFavor = isBuy ? delta > 0 : delta < 0;
  const pts = Math.abs(Math.round(delta / 0.01));
  return `Live price right now: ${bars.current} (entry was ${entry}). Price has moved ${pts}pts ${inFavor ? 'IN FAVOR of' : 'AGAINST'} this ${direction} since it fired. Recent market (last ~15min): ${bars.chop}, net ${bars.dir} move of ${bars.netPts}pts within a ${bars.rangePts}pt range.`;
}

async function upcomingEventNote(): Promise<string> {
  const now = new Date();
  const events = await calendarWindow(now.toISOString(), new Date(now.getTime() + 2 * 3600000).toISOString());
  const high = highImpact(events);
  if (high.length === 0) return "No high-impact economic event scheduled in the next 2 hours, per today's cached calendar.";
  const e = high[0];
  return `IMPORTANT: a high-impact economic event is scheduled soon -- ${e.currency ?? ''} ${e.event_name ?? 'economic event'} (impact: ${e.impact ?? 'unknown'}) at ${e.event_time}. Weight this heavily.`;
}

export interface AnalyseOutcome {
  signal_id: string;
  outcome: 'analysed' | 'error' | 'quota_exceeded' | 'already_analysed' | 'toggled_off' | 'missing_config';
  verdict?: 'valid' | 'invalid';
  detail?: string;
}

/** Append-only ai_runs row; never throws (audit logging must not break analysis). */
async function logAiRun(row: Record<string, unknown>): Promise<void> {
  try {
    await insertAiRun({ provider: 'groq', model: modelName(), prompt_version: VERDICT_PROMPT_VERSION, ...row });
  } catch {
    /* audit trail is best-effort */
  }
}

export async function analyseOneSignal(sig: SignalRow): Promise<AnalyseOutcome> {
  const key = getEnv().GROQ_API_KEY_ANALYSED_SIGNALS;
  if (!key) return { signal_id: sig.signal_id, outcome: 'missing_config', detail: 'GROQ_API_KEY_ANALYSED_SIGNALS not set.' };
  const db = getDb();
  if (!db) return { signal_id: sig.signal_id, outcome: 'missing_config', detail: 'Database not configured.' };
  if ((await getSetting('analysed_signals_enabled')) === 'false') return { signal_id: sig.signal_id, outcome: 'toggled_off' };

  const { data: existing } = await db.from('analysed_signals').select('id').eq('signal_id', sig.signal_id).maybeSingle();
  if (existing) return { signal_id: sig.signal_id, outcome: 'already_analysed' };
  if ((await getUsage('openrouter_usage', KEY_NAME)) >= DAILY_LIMIT) return { signal_id: sig.signal_id, outcome: 'quota_exceeded' };

  try {
    const [movement, calendar] = await Promise.all([priceContext(sig.entry, sig.direction), upcomingEventNote()]);
    const prompt = buildVerdictPrompt(sig, movement, calendar);
    const parsed = await completeVerdict(key, prompt);
    await bumpUsage('openrouter_usage', KEY_NAME, 1);

    const { tp, rr } = computePreferredExit({
      direction: sig.direction, entry: sig.entry, sl: sig.exits?.sl,
      verdict: parsed.verdict, preferred_rr: parsed.preferred_rr,
    });
    await db.from('analysed_signals').insert({
      signal_id: sig.signal_id,
      llm_model: modelName(),
      verdict: parsed.verdict,
      llm_entry: sig.entry,
      llm_sl: sig.exits?.sl ?? null,
      llm_tp: tp ?? sig.exits?.tp ?? null,
      llm_rr: rr ?? sig.risk?.tp_rr ?? sig.exits?.rr_selected ?? null,
      reasoning: parsed.reasoning ?? '',
      status: 'open',
      direction: sig.direction ?? null,
    });
    await logAiRun({
      signal_id: sig.signal_id,
      input_snapshot: { prompt, movement, calendar },
      output: { verdict: parsed.verdict, reasoning: parsed.reasoning ?? '', preferred_rr: parsed.preferred_rr ?? null },
      latency_ms: parsed.run.latencyMs,
      tokens: parsed.run.tokens,
    });
    publish({ kind: 'signal_analysed', signal_id: sig.signal_id, verdict: parsed.verdict });
    return { signal_id: sig.signal_id, outcome: 'analysed', verdict: parsed.verdict };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAiRun({ signal_id: sig.signal_id, input_snapshot: { stage: 'failed' }, output: { error: msg } });
    if (/rate limit|resource_exhausted|quota/i.test(msg)) {
      await bumpUsage('openrouter_usage', KEY_NAME, DAILY_LIMIT);
      return { signal_id: sig.signal_id, outcome: 'quota_exceeded', detail: msg };
    }
    return { signal_id: sig.signal_id, outcome: 'error', detail: msg };
  }
}

export async function analysePending(max = 5) {
  const db = getDb();
  if (!db) return { checked: 0, analysed: 0, note: 'Database not configured.' };
  if ((await getSetting('analysed_signals_enabled')) === 'false') return { skipped: true, reason: 'toggled_off' };
  const { data: already } = await db.from('analysed_signals').select('signal_id');
  const ids = new Set(((already ?? []) as { signal_id: string }[]).map((a) => a.signal_id));
  const { data: recent } = await db.from('signals').select('*').order('created_at', { ascending: true }).limit(200);
  const pending = ((recent ?? []) as SignalRow[]).filter((s) => !ids.has(s.signal_id)).slice(0, max);
  if (pending.length === 0) return { checked: 0, analysed: 0, note: 'Nothing pending.' };
  let analysed = 0;
  const results: AnalyseOutcome[] = [];
  for (const sig of pending) {
    const r = await analyseOneSignal(sig);
    results.push(r);
    if (r.outcome === 'analysed') analysed++;
    if (r.outcome === 'quota_exceeded') break;
  }
  return { checked: pending.length, analysed, results, limit: DAILY_LIMIT };
}

export async function newsStatus() {
  return {
    enabled: (await getSetting('analysed_signals_enabled')) !== 'false',
    used: await getUsage('openrouter_usage', KEY_NAME),
    limit: DAILY_LIMIT,
    model: modelName(),
    newsUsed: await getUsage('openrouter_usage', NEWS_KEY_NAME),
  };
}
