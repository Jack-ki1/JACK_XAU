// api/services/catalog — signals list/get/ingest, settings, calendar reads,
// closed-signal patterns, performance aggregates. Thin orchestration over repos.
import type { SignalRow } from '@jack-trade/shared';
import { getDb } from '../repositories/client.js';
import { calendarWindow, getSetting, listSignals, setSetting } from '../repositories/repos.js';

export async function getSignals(status?: string, limit = 50) {
  const rows = await listSignals(status, Math.min(limit, 200));
  return { signals: rows, count: rows.length };
}

export async function ingestSignal(body: unknown) {
  const db = getDb();
  if (!db) return { error: 'Database not configured.' };
  const b = body as Record<string, unknown>;
  if (typeof b?.signal_id !== 'string' || b.signal_id.length === 0) {
    return { error: 'signal_id (string) is required.' };
  }
  // Idempotent: re-delivery of the same webhook never duplicates.
  const { data: existing } = await db.from('signals').select('id').eq('signal_id', b.signal_id).maybeSingle();
  if (existing) return { signal_id: b.signal_id, outcome: 'already_exists' as const };
  const row: Record<string, unknown> = {
    signal_id: b.signal_id,
    symbol: typeof b.symbol === 'string' ? b.symbol : 'XAUUSD',
    direction: b.direction ?? null,
    signal_type: b.signal_type ?? null,
    path: b.path ?? null,
    entry: typeof b.entry === 'number' ? b.entry : null,
    exits: typeof b.exits === 'object' && b.exits !== null ? b.exits : {},
    risk: typeof b.risk === 'object' && b.risk !== null ? b.risk : {},
    grade: typeof b.grade === 'object' && b.grade !== null ? b.grade : {},
    htf_confluence: Array.isArray(b.htf_confluence) ? b.htf_confluence : [],
    htf_rung: b.htf_rung ?? null,
    execution_tf: b.execution_tf ?? null,
    manual_entry_filter: typeof b.manual_entry_filter === 'object' ? b.manual_entry_filter : null,
    window_info: typeof b.window_info === 'object' ? b.window_info : null,
    signal_version: b.signal_version ?? null,
    status: 'open',
  };
  const { data, error } = await db.from('signals').insert(row).select().maybeSingle();
  if (error) return { error: error.message };
  return { signal_id: b.signal_id, outcome: 'ingested' as const, id: (data as { id: number } | null)?.id ?? null };
}

export async function getSettings() {
  return { analysed_signals_enabled: (await getSetting('analysed_signals_enabled')) !== 'false' };
}

export async function patchSettings(body: unknown) {
  const b = body as Record<string, unknown>;
  if (typeof b?.analysed_signals_enabled !== 'boolean') {
    return { error: 'Body must include boolean "analysed_signals_enabled".' };
  }
  await setSetting('analysed_signals_enabled', String(b.analysed_signals_enabled));
  return { analysed_signals_enabled: b.analysed_signals_enabled };
}

export async function getCalendar() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  return { events: await calendarWindow(start.toISOString(), end.toISOString()) };
}

const MANUAL_CONDITIONS = [
  { key: 'bias_1h', label: '1H directional bias' },
  { key: 'zone_tapped', label: 'order block zone tapped' },
  { key: 'discount_premium', label: 'Fibonacci discount/premium' },
  { key: 'session_open', label: 'London/NY session open' },
  { key: 'doji_or_rejection', label: '1m doji or rejection candle' },
];

const MIN_SAMPLE = 3;

function sessionBucket(dateStr: string): string {
  const h = new Date(dateStr).getUTCHours();
  const inLondon = h >= 8 && h < 17;
  const inNY = h >= 13 && h < 22;
  if (inLondon && inNY) return 'Overlap';
  if (inLondon) return 'London';
  if (inNY) return 'New York';
  return 'Asian';
}

export async function closedPatterns() {
  const closed = (await listSignals('closed', 200)).filter((s) => s.final_outcome === 'tp_hit' || s.final_outcome === 'stopped_out');
  const wins = closed.filter((s) => s.final_outcome !== 'stopped_out').length;
  if (closed.length < MIN_SAMPLE) {
    return { totalClosed: closed.length, totalWins: wins, totalLosses: closed.length - wins, patterns: [], note: `Only ${closed.length} closed signals so far -- need at least ${MIN_SAMPLE}.` };
  }
  const patterns: string[] = [];
  const losses = closed.filter((s) => s.final_outcome === 'stopped_out');
  const precLosses = losses.filter((s) => s.signal_type === 'precision' && s.manual_entry_filter?.applicable === true);
  if (precLosses.length >= MIN_SAMPLE) {
    for (const { key, label } of MANUAL_CONDITIONS) {
      const n = precLosses.filter((s) => s.manual_entry_filter?.[key] === false).length;
      if (n / precLosses.length >= 0.5) patterns.push(`${n} of ${precLosses.length} Precision losses had "${label}" reading false at signal time.`);
    }
  }
  const byPath = (p: string) => closed.filter((s) => s.path === p);
  const [a, b] = [byPath('setup_a'), byPath('setup_b')];
  if (a.length >= MIN_SAMPLE && b.length >= MIN_SAMPLE) {
    const wr = (g: SignalRow[]) => Math.round((g.filter((s) => s.final_outcome !== 'stopped_out').length / g.length) * 100);
    if (Math.abs(wr(a) - wr(b)) >= 20) {
      patterns.push(`${wr(a) < wr(b) ? 'Setup A' : 'Setup B'} is winning less often (${Math.min(wr(a), wr(b))}% vs ${Math.max(wr(a), wr(b))}%).`);
    }
  }
  const order = ['Asian', 'London', 'New York', 'Overlap'];
  const sessStats = order
    .map((name) => {
      const g = closed.filter((s) => s.created_at && sessionBucket(s.created_at) === name);
      return { name, count: g.length, wr: g.length ? Math.round((g.filter((s) => s.final_outcome !== 'stopped_out').length / g.length) * 100) : 0 };
    })
    .filter((s) => s.count >= MIN_SAMPLE);
  if (sessStats.length >= 2) {
    const sorted = [...sessStats].sort((x, y) => x.wr - y.wr);
    const avg = sorted.slice(1).reduce((s, x) => s + x.wr, 0) / (sorted.length - 1);
    if (avg - sorted[0].wr >= 20) patterns.push(`${sorted[0].name} session trails (${sorted[0].wr}% vs ~${Math.round(avg)}% elsewhere).`);
  }
  const lo = closed.filter((s) => (s.grade?.value ?? 99) <= 2);
  const hi = closed.filter((s) => (s.grade?.value ?? -1) >= 5);
  if (lo.length >= MIN_SAMPLE && hi.length >= MIN_SAMPLE) {
    const wr = (g: SignalRow[]) => Math.round((g.filter((s) => s.final_outcome !== 'stopped_out').length / g.length) * 100);
    if (wr(hi) - wr(lo) >= 20) patterns.push(`Grade 5+/7 beats grade 0-2/7 (${wr(hi)}% vs ${wr(lo)}%).`);
  }
  return {
    totalClosed: closed.length, totalWins: wins, totalLosses: closed.length - wins, patterns,
    note: patterns.length === 0 ? 'No pattern clears the reporting threshold yet.' : null,
  };
}

export async function performanceSummary() {
  const closed = (await listSignals('closed', 1000)).filter((s) => s.final_outcome === 'tp_hit' || s.final_outcome === 'stopped_out');
  const wins = closed.filter((s) => s.final_outcome !== 'stopped_out').length;
  const POINT = 0.01;
  const net = closed.reduce((sum, s) => {
    if (s.entry == null) return sum;
    if (s.final_outcome === 'stopped_out' && s.exits?.sl != null) return sum - Math.round(Math.abs(s.entry - s.exits.sl) / POINT);
    if (s.final_outcome === 'tp_hit' && s.exits?.tp != null) return sum + Math.round(Math.abs(s.entry - s.exits.tp) / POINT);
    return sum;
  }, 0);
  return {
    total: closed.length, wins, losses: closed.length - wins,
    winRate: closed.length ? Math.round((wins / closed.length) * 1000) / 10 : null,
    netPoints: net,
  };
}
