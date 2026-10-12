// api/providers/calendar — JBlanked economic calendar (1 req/day free).
// Field names are best-effort (upstream schema unconfirmed); misses are
// dropped, never thrown.
import { getEnv } from '../config/env.js';
import { errorMessage } from '../lib/errors.js';
import { getDb } from '../repositories/client.js';
import { todayUTC } from '../lib/errors.js';
import { readJson } from '../lib/http.js';

function extractField(obj: unknown, candidates: string[]): unknown {
  if (typeof obj !== 'object' || obj === null) return null;
  const record = obj as Record<string, unknown>;
  for (const key of candidates) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

export interface FetchResult {
  fetched: number;
  skipped?: boolean;
  reason?: string;
  diagnostic?: unknown;
}

export async function refreshCalendar(): Promise<FetchResult> {
  const key = getEnv().JBLANKED_API_KEY;
  if (!key) throw Object.assign(new Error('JBLANKED_API_KEY not set.'), { code: 'calendar_disabled' });
  const db = getDb();
  if (!db) throw Object.assign(new Error('Database not configured.'), { code: 'db_disabled' });
  const today = todayUTC();

  const { data: existing } = await db.from('calendar_fetch_attempts').select('attempt_date, events_extracted').eq('attempt_date', today).maybeSingle();
  if (existing) return { fetched: 0, skipped: true, reason: 'already_attempted_today' };

  try {
    const res = await fetch('https://www.jblanked.com/news/api/mql5/calendar/today/', {
      headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    const data = await readJson(res);
    await db.from('calendar_fetch_attempts').upsert({ attempt_date: today, events_extracted: 0 });
    if (!res.ok) throw new Error(`JBlanked HTTP ${res.status}`);
    const rawEvents: unknown[] = Array.isArray(data.values ?? data) ? ((Array.isArray(data) ? data : []) as unknown[]) : ((data.events ?? data.results ?? []) as unknown[]);
    const rows = rawEvents
      .map((e) => ({
        event_time: extractField(e, ['date', 'time', 'event_time', 'datetime']),
        currency: extractField(e, ['currency', 'economy', 'symbol']),
        event_name: extractField(e, ['name', 'event', 'title']),
        impact: extractField(e, ['impact', 'strength', 'category']),
        fetched_for_date: today,
      }))
      .filter((r) => r.event_time);
    if (rows.length > 0) await db.from('calendar_events').insert(rows);
    await db.from('calendar_fetch_attempts').update({ events_extracted: rows.length }).eq('attempt_date', today);
    if (rows.length === 0) return { fetched: 0, diagnostic: Array.isArray(rawEvents) ? rawEvents.slice(0, 2) : rawEvents };
    return { fetched: rows.length };
  } catch (e) {
    throw new Error(errorMessage(e));
  }
}
