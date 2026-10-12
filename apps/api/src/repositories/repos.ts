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
