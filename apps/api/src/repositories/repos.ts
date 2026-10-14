// api/repositories/repos — typed table access. Row shapes come from
// @jack-trade/shared; every function degrades to empty when DB is missing.
import type { SignalRow, VerdictRow, NotificationRow, CalendarEventRow } from '@jack-trade/shared';
import { getDb } from './client.js';

export async function listSignals(status?: string, limit = 200): Promise<SignalRow[]> {
  const db = getDb();
  if (!db) return [];
  let q = db.from('signals').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as SignalRow[];
}

export async function listSignalsByIds(signalIds: string[]): Promise<SignalRow[]> {
  const db = getDb();
  if (!db || signalIds.length === 0) return [];
  const { data } = await db.from('signals').select('*').in('signal_id', signalIds.slice(0, 100));
  return (data ?? []) as SignalRow[];
}

export async function getSignalBySignalId(signalId: string): Promise<SignalRow | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('signals').select('*').eq('signal_id', signalId).maybeSingle();
  return (data ?? null) as SignalRow | null;
}

export async function insertSignal(row: Record<string, unknown>): Promise<SignalRow | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('signals').insert(row).select().maybeSingle();
  return (data ?? null) as SignalRow | null;
}

export async function updateSignal(id: number, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('signals').update(patch).eq('id', id);
}

export async function listVerdicts(table: 'analysed_signals' | 'news_signals', status?: string, limit = 200) {
  const db = getDb();
  if (!db) return [];
  let q = db.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as VerdictRow[];
}

export async function insertVerdict(table: 'analysed_signals' | 'news_signals', row: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from(table).insert(row);
}

export async function updateVerdict(table: 'analysed_signals' | 'news_signals', id: number, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from(table).update(patch).eq('id', id);
}

export async function notify(type: string, message: string, detail: string | null = null): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('notifications').insert({ type, message, detail });
}

export async function latestNotifications(limit = 20): Promise<NotificationRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from('notifications').select('id, type, message, created_at').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as NotificationRow[];
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (!data) return null;
  const v = (data as { value: unknown }).value;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('app_settings').upsert({ key, value });
}

export async function getUsage(table: 'av_usage' | 'openrouter_usage', keyName: string, date = new Date().toISOString().slice(0, 10)): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const { data } = await db.from(table).select('count').eq('usage_date', date).eq('key_name', keyName).maybeSingle();
  return (data as { count: number } | null)?.count ?? 0;
}

export async function bumpUsage(table: 'av_usage' | 'openrouter_usage', keyName: string, by: number): Promise<number> {
  const db = getDb();
  if (!db) return by;
  const next = (await getUsage(table, keyName)) + by;
  await db.from(table).upsert({ usage_date: new Date().toISOString().slice(0, 10), key_name: keyName, count: next });
  return next;
}

export async function calendarWindow(startIso: string, endIso: string): Promise<CalendarEventRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from('calendar_events')
    .select('event_time, currency, event_name, impact')
    .gte('event_time', startIso)
    .lte('event_time', endIso)
    .order('event_time', { ascending: true });
  return (data ?? []) as CalendarEventRow[];
}

export function highImpact(events: CalendarEventRow[]): CalendarEventRow[] {
  return events.filter((e) => typeof e.impact === 'string' && e.impact.toLowerCase().includes('high'));
}

// ===== v2: candles, signal events, journal, read-state, rejections =====

export interface CandleRow {
  symbol: string
  tf: string
  ts_utc: string
  open: number
  high: number
  low: number
  close: number
  tick_volume: number | null
  source: string
}

export async function upsertCandles(rows: CandleRow[]): Promise<number> {
  const db = getDb();
  if (!db || rows.length === 0) return 0;
  // Chunk to keep request sizes sane on big backfills.
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from('candles').upsert(chunk, { onConflict: 'symbol,tf,ts_utc' });
    if (!error) written += chunk.length;
  }
  return written;
}

export async function readCandles(tf: string, fromIso: string, toIso: string, limit = 5000): Promise<CandleRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from('candles')
    .select('*')
    .eq('tf', tf)
    .gte('ts_utc', fromIso)
    .lte('ts_utc', toIso)
    .order('ts_utc', { ascending: true })
    .limit(limit);
  return (data ?? []) as CandleRow[];
}

export async function latestCandleTs(tf: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('candles').select('ts_utc').eq('tf', tf).order('ts_utc', { ascending: false }).limit(1).maybeSingle();
  return (data as { ts_utc: string } | null)?.ts_utc ?? null;
}

export async function appendSignalEvent(signalId: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('signal_events').insert({ signal_id: signalId, type, payload });
}

export async function listSignalEvents(signalId: string, limit = 200): Promise<Array<{ id: number; signal_id: string; ts: string; type: string; payload: Record<string, unknown> }>> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from('signal_events').select('*').eq('signal_id', signalId).order('ts', { ascending: true }).limit(limit);
  return (data ?? []) as Array<{ id: number; signal_id: string; ts: string; type: string; payload: Record<string, unknown> }>;
}

export async function logIngestRejection(reason: string, body: unknown): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('ingest_rejections').insert({ reason, body: body ?? null });
}

export async function getReadState(key: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('desk_read_state').select('last_read_at').eq('key', key).maybeSingle();
  return (data as { last_read_at: string } | null)?.last_read_at ?? null;
}

export async function setReadState(key: string, atIso: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('desk_read_state').upsert({ key, last_read_at: atIso });
}

export async function getJournal(signalId: string): Promise<Record<string, unknown> | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('signal_journal').select('*').eq('signal_id', signalId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function upsertJournal(signalId: string, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('signal_journal').upsert({ signal_id: signalId, ...patch, updated_at: new Date().toISOString() });
}

export async function listJournal(limit = 200): Promise<Array<Record<string, unknown>>> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from('signal_journal').select('*').order('updated_at', { ascending: false }).limit(limit);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function insertAiRun(row: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('ai_runs').insert(row);
}

export async function listAiRuns(signalId?: string, limit = 200): Promise<Array<Record<string, unknown>>> {
  const db = getDb();
  if (!db) return [];
  let q = db.from('ai_runs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (signalId) q = q.eq('signal_id', signalId);
  const { data } = await q;
  return (data ?? []) as Array<Record<string, unknown>>;
}

// ===== v2 alert rules + events (C10) ====================================

export interface AlertRuleRow {
  id: number;
  name: string;
  kind: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export async function listAlertRules(): Promise<AlertRuleRow[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from('alert_rules').select('*').order('id', { ascending: true });
  return (data ?? []) as AlertRuleRow[];
}

export async function insertAlertRule(row: { name: string; kind: string; config: Record<string, unknown> }): Promise<AlertRuleRow | null> {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db.from('alert_rules').insert({ ...row, enabled: true }).select().maybeSingle();
  if (error) throw error;
  return (data as AlertRuleRow | null) ?? null;
}

export async function setAlertRuleEnabled(id: number, enabled: boolean): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const { data } = await db.from('alert_rules').update({ enabled }).eq('id', id).select('id');
  return Boolean(data && data.length > 0);
}

export async function deleteAlertRule(id: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const { data } = await db.from('alert_rules').delete().eq('id', id).select('id');
  return Boolean(data && data.length > 0);
}

export async function insertAlertEvent(row: { dedupe_key: string; message: string; rule_id?: number | null; detail?: Record<string, unknown> }): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const { error } = await db.from('alert_events').insert({
    dedupe_key: row.dedupe_key,
    message: row.message,
    rule_id: row.rule_id ?? null,
    detail: row.detail ?? null,
    delivered_at: new Date().toISOString(),
  });
  // 23505 = unique_violation → deduped, treat as handled.
  if (error && (error as { code?: string }).code !== '23505') throw error;
  return true;
}

export async function listAlertEvents(limit = 100): Promise<Array<Record<string, unknown>>> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db.from('alert_events').select('*').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Array<Record<string, unknown>>;
}

// ===== v2 MT5 bridge snapshots (C11) ====================================

export async function insertMt5Snapshot(row: {
  account: Record<string, unknown>;
  positions: Array<Record<string, unknown>>;
  bridge_status?: string;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from('mt5_snapshots').insert({
    account: row.account,
    positions: row.positions,
    bridge_status: row.bridge_status ?? 'ok',
  });
}

export async function latestMt5Snapshot(): Promise<Record<string, unknown> | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db.from('mt5_snapshots').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}
