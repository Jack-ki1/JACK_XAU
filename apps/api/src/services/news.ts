// api/services/news — news-window verdicts (Groq, news-weighted prompt).
// Ports process-news-signals. Zero cost outside an active window.
import { computePreferredExit, rrLevelsFor } from '@jack-trade/engine';
import type { SignalRow } from '@jack-trade/shared';
import { getEnv } from '../config/env.js';
import { completeVerdict, modelName } from '../providers/llm.js';
import { fetchHeadlines } from '../providers/finnhub.js';
import { getDb } from '../repositories/client.js';
import { bumpUsage, calendarWindow, getUsage, highImpact } from '../repositories/repos.js';
import { publish } from '../plugins/sse.js';

const DAILY_LIMIT = 1000;
const KEY_NAME = 'news_signals';
const PRE_MINUTES = 15;
const POST_MINUTES = 30;
const MAX_PER_RUN = 5;

function buildPrompt(sig: SignalRow, eventLabel: string, newsText: string): string {
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

export async function processNewsSignals() {
  const now = new Date();
  const events = await calendarWindow(
    new Date(now.getTime() - POST_MINUTES * 60000).toISOString(),
    new Date(now.getTime() + PRE_MINUTES * 60000).toISOString(),
  );
  const high = highImpact(events);
  if (high.length === 0) return { skipped: true, reason: 'no_active_news_window' };
  const e = high[0];
  const activeEvent = { label: `${e.currency ?? ''} ${e.event_name ?? 'economic event'} (${e.impact ?? 'high'} impact)`, time: e.event_time };

  const key = getEnv().GROQ_API_KEY_NEWS_SIGNALS;
  if (!key) return { error: 'GROQ_API_KEY_NEWS_SIGNALS not set.' };
  const db = getDb();
  if (!db) return { error: 'Database not configured.' };
  const used = await getUsage('openrouter_usage', KEY_NAME);
  if (used >= DAILY_LIMIT) return { skipped: true, reason: 'quota_exhausted', activeEvent, used, limit: DAILY_LIMIT };

  const { data: already } = await db.from('news_signals').select('signal_id');
  const ids = new Set(((already ?? []) as { signal_id: string }[]).map((a) => a.signal_id));
  const lookback = new Date(Date.now() - POST_MINUTES * 60000).toISOString();
  const { data: recent } = await db.from('signals').select('*').gte('created_at', lookback).order('created_at', { ascending: true }).limit(50);
  const pending = ((recent ?? []) as SignalRow[]).filter((s) => !ids.has(s.signal_id)).slice(0, MAX_PER_RUN);
  if (pending.length === 0) return { activeEvent, checked: 0, processed: 0, used, limit: DAILY_LIMIT };

  const { text: newsText } = await fetchHeadlines();
  let processed = 0;
  let credits = 0;
  const results: { signal_id: string; verdict?: string; outcome?: string; detail?: string }[] = [];
  for (const sig of pending) {
    if (used + credits >= DAILY_LIMIT) {
      results.push({ signal_id: sig.signal_id, outcome: 'quota_exceeded' });
      continue;
    }
    try {
      const parsed = await completeVerdict(key, buildPrompt(sig, activeEvent.label, newsText));
      credits++;
      const { tp, rr } = computePreferredExit({
        direction: sig.direction, entry: sig.entry, sl: sig.exits?.sl,
        verdict: parsed.verdict, preferred_rr: parsed.preferred_rr,
      });
      await db.from('news_signals').insert({
        signal_id: sig.signal_id,
        direction: sig.direction ?? null,
        triggering_event: activeEvent.label,
        news_summary: newsText ? newsText.split('\n')[0] : null,
        llm_model: modelName(),
        verdict: parsed.verdict,
        llm_entry: sig.entry,
        llm_sl: sig.exits?.sl ?? null,
        llm_tp: tp ?? sig.exits?.tp ?? null,
        llm_rr: rr ?? sig.risk?.tp_rr ?? sig.exits?.rr_selected ?? null,
        reasoning: parsed.reasoning ?? '',
        status: 'open',
      });
      processed++;
      results.push({ signal_id: sig.signal_id, verdict: parsed.verdict });
      publish({ kind: 'signal_analysed', signal_id: sig.signal_id, verdict: parsed.verdict, news: true });
    } catch (err) {
      results.push({ signal_id: sig.signal_id, outcome: 'error', detail: err instanceof Error ? err.message : String(err) });
    }
  }
  const finalUsed = await bumpUsage('openrouter_usage', KEY_NAME, credits);
  return { activeEvent, checked: pending.length, processed, creditsUsedThisRun: credits, results, used: finalUsed, limit: DAILY_LIMIT };
}
