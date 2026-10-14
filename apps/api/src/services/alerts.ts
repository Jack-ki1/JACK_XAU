// api/services/alerts — v2 C10 alert evaluation. System conditions
// (feed_stale, job_failed) always run; config-driven rules (news_tminus,
// price_cross) come from alert_rules. Every event is deduped via
// alert_events.dedupe_key so a condition fires once, not every 5 minutes.
import { getDb } from '../repositories/client.js';
import { calendarWindow, highImpact, insertAlertEvent, listAlertRules } from '../repositories/repos.js';
import { storeFreshness } from './candles.js';
import { jobStatus } from '../jobs/scheduler.js';

const FEED_STALE_MINUTES = 60;
const DEFAULT_TMINUS_MINUTES = 30;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function checkFeedStale(): Promise<number> {
  const freshness = await storeFreshness();
  const worst = freshness.reduce<{ tf: string; ageMinutes: number | null }>(
    (a, b) => (b.ageMinutes ?? -1) > (a.ageMinutes ?? -1) ? b : a,
    { tf: '-', ageMinutes: null },
  );
  if (worst.ageMinutes != null && worst.ageMinutes > FEED_STALE_MINUTES) {
    await insertAlertEvent({
      dedupe_key: `feed_stale:${todayKey()}`,
      message: `Market data stale: latest ${worst.tf} candle is ${Math.round(worst.ageMinutes)}m old.`,
      detail: { tf: worst.tf, ageMinutes: worst.ageMinutes },
    });
    return 1;
  }
  return 0;
}

async function checkJobFailures(): Promise<number> {
  let fired = 0;
  for (const [name, st] of jobStatus) {
    if (st.lastResult !== 'ok' && st.lastRun) {
      await insertAlertEvent({
        dedupe_key: `job_failed:${name}:${st.lastRun}`,
        message: `Job ${name} failed: ${st.lastResult}`,
        detail: { job: name, lastRun: st.lastRun },
      });
      fired++;
    }
  }
  return fired;
}

async function checkNewsTminus(rules: Awaited<ReturnType<typeof listAlertRules>>): Promise<number> {
  const tminusRules = rules.filter((r) => r.enabled && r.kind === 'news_tminus');
  if (tminusRules.length === 0) return 0;
  const minutes = Math.max(...tminusRules.map((r) => Number((r.config as { minutes?: number }).minutes ?? DEFAULT_TMINUS_MINUTES)));
  const now = new Date();
  const events = await calendarWindow(now.toISOString(), new Date(now.getTime() + minutes * 60000).toISOString());
  const soon = highImpact(events);
  let fired = 0;
  for (const e of soon) {
    await insertAlertEvent({
      dedupe_key: `news_tminus:${e.event_time}:${e.event_name}`,
      rule_id: tminusRules[0]?.id ?? null,
      message: `High-impact event in <${minutes}m: ${e.currency ?? ''} ${e.event_name ?? 'event'} at ${e.event_time}.`,
      detail: { minutes, event: e },
    });
    fired++;
  }
  return fired;
}

async function checkPriceCross(rules: Awaited<ReturnType<typeof listAlertRules>>): Promise<number> {
  const crossRules = rules.filter((r) => r.enabled && r.kind === 'price_cross');
  if (crossRules.length === 0) return 0;
  const db = getDb();
  if (!db) return 0;
  const { data: latest } = await db
    .from('candles').select('close, ts_utc')
    .eq('tf', '1')
    .order('ts_utc', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return 0;
  const price = Number((latest as { close: number }).close);
  let fired = 0;
  for (const r of crossRules) {
    const cfg = r.config as { level?: number; direction?: 'above' | 'below' };
    if (typeof cfg.level !== 'number' || !Number.isFinite(cfg.level)) continue;
    const crossed = cfg.direction === 'below' ? price < cfg.level : price > cfg.level;
    if (!crossed) continue;
    await insertAlertEvent({
      dedupe_key: `price_cross:${r.id}:${todayKey()}`,
      rule_id: r.id,
      message: `${cfg.direction === 'below' ? 'Price below' : 'Price above'} ${cfg.level} (last ${price}).`,
      detail: { level: cfg.level, price },
    });
    fired++;
  }
  return fired;
}

export async function evaluateAlerts(): Promise<{ fired: number; rules: number }> {
  const rules = await listAlertRules();
  const results = await Promise.all([
    checkFeedStale(),
    checkJobFailures(),
    checkNewsTminus(rules),
    checkPriceCross(rules),
  ]);
  return { fired: results.reduce((a, b) => a + b, 0), rules: rules.filter((r) => r.enabled).length };
}
