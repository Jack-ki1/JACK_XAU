// api/services/resolution — resolve open signals/verdicts against real bars.
// Ports check-open-signals + check-analysed-signals + check-news-signals.
// Same cost design: one Twelve Data request per interval bucket per cycle;
// `valid` verdict rows sync free from their source signal (llm_sl == Pine SL).
import { getEnv } from '../config/env.js';
import { fetchBarsSince, resolutionKey, type TdBar } from '../providers/twelveData.js';
import { bumpUsage, getUsage, listSignals, listVerdicts, updateSignal, updateVerdict, getSignalBySignalId, appendSignalEvent } from '../repositories/repos.js';
import { getDb } from '../repositories/client.js';
import { publish } from '../plugins/sse.js';

const DAILY_LIMIT = 800;
const KEY_NAME = 'resolution';
const INTERVAL_MAP: Record<string, string> = { '1': '1min', '3': '5min', '5': '5min' };

export interface WalkResult {
  outcome: 'tp_hit' | 'stopped_out' | 'still_open';
  resolvedAt: string | null;
}

/** Closest-to-open tie-break: whichever level sits nearer the bar's open
 * was more likely touched first (same heuristic as the legacy resolvers). */
export function walkForOutcome(bars: TdBar[], direction: string, sl: number | null, tp: number | null): WalkResult {
  const isBuy = direction === 'buy' || direction === 'long';
  for (const bar of bars) {
    const slTouched = sl != null && (isBuy ? bar.low <= sl : bar.high >= sl);
    const tpTouched = tp != null && (isBuy ? bar.high >= tp : bar.low <= tp);
    if (slTouched && tpTouched) {
      const distToSL = Math.abs(bar.open - (sl as number));
      const distToTP = Math.abs(bar.open - (tp as number));
      if (distToTP < distToSL) return { outcome: 'tp_hit', resolvedAt: bar.time };
      return { outcome: 'stopped_out', resolvedAt: bar.time };
    }
    if (slTouched) return { outcome: 'stopped_out', resolvedAt: bar.time };
    if (tpTouched) return { outcome: 'tp_hit', resolvedAt: bar.time };
  }
  return { outcome: 'still_open', resolvedAt: null };
}

export async function checkOpenSignals() {
  const used = await getUsage('av_usage', KEY_NAME);
  if (used >= DAILY_LIMIT) return { checked: 0, quotaExceeded: true, used, limit: DAILY_LIMIT };
  const open = await listSignals('open', 500);
  if (open.length === 0) return { checked: 0, closed: 0, stillOpen: 0, creditsUsedThisRun: 0, used, limit: DAILY_LIMIT };

  const groups = new Map<string, typeof open>();
  for (const sig of open) {
    const interval = INTERVAL_MAP[sig.execution_tf ?? ''] ?? '1min';
    groups.set(interval, [...(groups.get(interval) ?? []), sig]);
  }

  let credits = 0;
  let closed = 0;
  const results: { signal_id: string; outcome: string }[] = [];
  for (const [interval, group] of groups) {
    if (used + credits >= DAILY_LIMIT) {
      for (const sig of group) results.push({ signal_id: sig.signal_id, outcome: 'quota_exceeded' });
      continue;
    }
    let earliest: string | null = null;
    for (const sig of group) {
      const cursor = sig.last_checked_at ?? sig.created_at;
      if (!earliest || new Date(cursor).getTime() < new Date(earliest).getTime()) earliest = cursor;
    }
    if (!earliest) continue;
    const bars = await fetchBarsSince(earliest, interval, resolutionKey());
    credits++;
    for (const sig of group) {
      const cursorMs = new Date(sig.last_checked_at ?? sig.created_at).getTime();
      const relevant = bars.filter((b) => new Date(b.time).getTime() > cursorMs);
      if (relevant.length === 0) {
        results.push({ signal_id: sig.signal_id, outcome: 'no_new_bars' });
        continue;
      }
      const direction = sig.direction === 'buy' || sig.direction === 'long' ? 'buy' : 'sell';
      const r = walkForOutcome(relevant, direction, sig.exits?.sl ?? null, sig.exits?.tp ?? null);
      if (r.outcome === 'still_open') {
        await updateSignal(sig.id, { last_checked_at: new Date(relevant[relevant.length - 1].time).toISOString() });
        results.push({ signal_id: sig.signal_id, outcome: 'still_open' });
      } else {
        const resolvedAt = r.resolvedAt ? new Date(r.resolvedAt) : new Date();
        const secs = Math.max(0, Math.round((resolvedAt.getTime() - new Date(sig.created_at).getTime()) / 1000));
        await updateSignal(sig.id, {
          sl_hit: r.outcome === 'stopped_out',
          tp_hit: r.outcome === 'tp_hit',
          status: 'closed',
          final_outcome: r.outcome,
          state: r.outcome === 'tp_hit' ? 'closed' : 'stopped',
          resolved_at: resolvedAt.toISOString(),
          time_to_resolution: `${secs} seconds`,
        });
        // v2: immutable event log entry (projection above is derivable from this).
        await appendSignalEvent(sig.signal_id, r.outcome === 'tp_hit' ? 'closed' : 'stopped', {
          resolvedAt: resolvedAt.toISOString(),
          sl: sig.exits?.sl ?? null,
          tp: sig.exits?.tp ?? null,
        });
        closed++;
        results.push({ signal_id: sig.signal_id, outcome: r.outcome });
        publish({ kind: 'signal_closed', signal_id: sig.signal_id, outcome: r.outcome });
      }
    }
  }
  const finalUsed = await bumpUsage('av_usage', KEY_NAME, credits);
  return { checked: open.length, closed, stillOpen: open.length - closed, creditsUsedThisRun: credits, results, used: finalUsed, limit: DAILY_LIMIT };
}

async function resolveVerdictTable(table: 'analysed_signals' | 'news_signals') {
  const db = getDb();
  let synced = 0;
  if (db) {
    const { data: validOpen } = await db.from(table).select('id, signal_id').eq('status', 'open').eq('verdict', 'valid');
    for (const row of (validOpen ?? []) as { id: number; signal_id: string }[]) {
      const original = await getSignalBySignalId(row.signal_id);
      if (original && original.status === 'closed') {
        await updateVerdict(table, row.id, { status: 'closed', final_outcome: original.final_outcome, resolved_at: original.resolved_at });
        synced++;
      }
    }
  }
  if (!resolutionKey()) return { syncedFromOriginal: synced, invalidChecked: 0, note: 'TWELVEDATA_API_KEY_RESOLUTION not set.' };
  const used = await getUsage('av_usage', KEY_NAME);
  if (used >= DAILY_LIMIT) return { syncedFromOriginal: synced, invalidChecked: 0, quotaExceeded: true, used, limit: DAILY_LIMIT };
  const invalidOpen = (await listVerdicts(table, 'open', 500)).filter((r) => r.verdict === 'invalid');
  if (invalidOpen.length === 0) return { syncedFromOriginal: synced, invalidChecked: 0, used, limit: DAILY_LIMIT };

  let earliest: string | null = null;
  for (const sig of invalidOpen) {
    const cursor = sig.last_checked_at ?? sig.created_at ?? new Date().toISOString();
    if (!earliest || new Date(cursor).getTime() < new Date(earliest).getTime()) earliest = cursor;
  }
  const bars = await fetchBarsSince(earliest as string, '1min', resolutionKey());
  await bumpUsage('av_usage', KEY_NAME, 1);

  let closed = 0;
  const results: { signal_id: string; outcome: string; detail?: string }[] = [];
  for (const sig of invalidOpen) {
    const cursorMs = new Date(sig.last_checked_at ?? sig.created_at ?? 0).getTime();
    const relevant = bars.filter((b) => new Date(b.time).getTime() > cursorMs);
    if (relevant.length === 0) {
      results.push({ signal_id: sig.signal_id, outcome: 'no_new_bars' });
      continue;
    }
    if (!sig.direction) {
      results.push({ signal_id: sig.signal_id, outcome: 'error', detail: 'Missing direction — cannot safely resolve.' });
      continue;
    }
    const r = walkForOutcome(relevant, sig.direction, sig.llm_sl ?? null, sig.llm_tp ?? null);
    if (r.outcome === 'still_open') {
      await updateVerdict(table, sig.id, { last_checked_at: new Date(relevant[relevant.length - 1].time).toISOString() });
      results.push({ signal_id: sig.signal_id, outcome: 'still_open' });
    } else {
      await updateVerdict(table, sig.id, { status: 'closed', final_outcome: r.outcome, resolved_at: (r.resolvedAt ? new Date(r.resolvedAt) : new Date()).toISOString() });
      closed++;
      results.push({ signal_id: sig.signal_id, outcome: r.outcome });
    }
  }
  return { syncedFromOriginal: synced, invalidChecked: invalidOpen.length, closed, results, creditsUsedThisRun: 1, used: await getUsage('av_usage', KEY_NAME), limit: DAILY_LIMIT };
}

export const checkAnalysedSignals = () => resolveVerdictTable('analysed_signals');
export const checkNewsSignals = () => resolveVerdictTable('news_signals');

export function resolutionStatus() {
  const e = getEnv();
  return {
    enabled: Boolean(e.TWELVEDATA_API_KEY_RESOLUTION),
    reason: e.TWELVEDATA_API_KEY_RESOLUTION ? undefined : 'TWELVEDATA_API_KEY_RESOLUTION not set',
    dailyLimit: DAILY_LIMIT,
    keyName: KEY_NAME,
  };
}
