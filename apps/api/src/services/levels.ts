// api/services/levels — cached prev day/week levels + break detection.
// Ports lib/priceLevels.ts: pure compare via engine/detectBreaks, Supabase
// cache + flags + Twelve Data fetch here (I/O belongs to the service).
import { detectBreaks, weekRolledOver, type PriceLevels } from '@jack-trade/engine';
import { fetchSpotPrice, resolutionKey } from '../providers/twelveData.js';
import { getSetting, setSetting } from '../repositories/repos.js';
import { readJson } from '../lib/http.js';

async function fetchPreviousCompletedBar(interval: '1day' | '1week'): Promise<{ high: number; low: number } | null> {
  const key = resolutionKey();
  if (!key) return null;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=3&apikey=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await readJson(res);
    if (data?.status === 'error' || !Array.isArray(data?.values) || data.values.length < 2) return null;
    const today = new Date().toISOString().slice(0, 10);
    const values = data.values as { datetime: string; high: string | number; low: string | number }[];
    const completed = values.find((v) => v.datetime.slice(0, 10) < today) || values[1];
    if (!completed) return null;
    return { high: parseFloat(String(completed.high)), low: parseFloat(String(completed.low)) };
  } catch {
    return null;
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getCachedLevels(): Promise<PriceLevels & { date: string }> {
  const today = todayUTC();
  if ((await getSetting('price_levels_cache_date')) === today) {
    const g = async (k: string) => {
      const v = await getSetting(k);
      return v != null ? parseFloat(v) : null;
    };
    return {
      date: today,
      prevDayHigh: await g('prev_day_high'),
      prevDayLow: await g('prev_day_low'),
      prevWeekHigh: await g('prev_week_high'),
      prevWeekLow: await g('prev_week_low'),
    };
  }
  const prevCachedWeekHigh = await getSetting('prev_week_high');
  const [dayBar, weekBar] = await Promise.all([fetchPreviousCompletedBar('1day'), fetchPreviousCompletedBar('1week')]);
  const levels = {
    date: today,
    prevDayHigh: dayBar?.high ?? null,
    prevDayLow: dayBar?.low ?? null,
    prevWeekHigh: weekBar?.high ?? null,
    prevWeekLow: weekBar?.low ?? null,
  };
  await setSetting('price_levels_cache_date', today);
  if (levels.prevDayHigh != null) await setSetting('prev_day_high', String(levels.prevDayHigh));
  if (levels.prevDayLow != null) await setSetting('prev_day_low', String(levels.prevDayLow));
  if (levels.prevWeekHigh != null) await setSetting('prev_week_high', String(levels.prevWeekHigh));
  if (levels.prevWeekLow != null) await setSetting('prev_week_low', String(levels.prevWeekLow));
  await setSetting('notified_daily_high_break', 'false');
  await setSetting('notified_daily_low_break', 'false');
  if (weekRolledOver(prevCachedWeekHigh != null ? parseFloat(prevCachedWeekHigh) : null, levels.prevWeekHigh)) {
    await setSetting('notified_weekly_high_break', 'false');
    await setSetting('notified_weekly_low_break', 'false');
  }
  return levels;
}

/** New (not-yet-notified) breaks; marks them notified. Empty when disabled. */
export async function checkPriceLevelBreaks() {
  const levels = await getCachedLevels();
  const livePrice = await fetchSpotPrice(resolutionKey());
  if (livePrice == null) return [];
  const out = [];
  for (const b of detectBreaks(levels, livePrice)) {
    const flag = `notified_${b.type.replace('daily_', 'daily_').replace('weekly_', 'weekly_')}_break`;
    if ((await getSetting(flag)) === 'true') continue;
    out.push(b);
    await setSetting(flag, 'true');
  }
  return out;
}

export async function currentLevels() {
  return getCachedLevels();
}
