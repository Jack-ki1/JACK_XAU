// engine/levels — PURE price-level break detection.
// Extracted (Phase 2) from lib/priceLevels.ts: the comparison logic with no
// Supabase cache, no Twelve Data fetch, no notification flags. The API owns
// caching/fetching (services/levels); this module answers one question:
// given levels + a live price, what broke?

export interface PriceLevels {
  prevDayHigh: number | null;
  prevDayLow: number | null;
  prevWeekHigh: number | null;
  prevWeekLow: number | null;
}

export type LevelBreakType = 'daily_high' | 'daily_low' | 'weekly_high' | 'weekly_low';

export interface PriceLevelBreak {
  type: LevelBreakType;
  level: number;
  livePrice: number;
}

/** All breaks of cached levels at the given live price (no dedup, no I/O). */
export function detectBreaks(levels: PriceLevels, livePrice: number): PriceLevelBreak[] {
  const breaks: PriceLevelBreak[] = [];
  if (levels.prevDayHigh != null && livePrice > levels.prevDayHigh) {
    breaks.push({ type: 'daily_high', level: levels.prevDayHigh, livePrice });
  }
  if (levels.prevDayLow != null && livePrice < levels.prevDayLow) {
    breaks.push({ type: 'daily_low', level: levels.prevDayLow, livePrice });
  }
  if (levels.prevWeekHigh != null && livePrice > levels.prevWeekHigh) {
    breaks.push({ type: 'weekly_high', level: levels.prevWeekHigh, livePrice });
  }
  if (levels.prevWeekLow != null && livePrice < levels.prevWeekLow) {
    breaks.push({ type: 'weekly_low', level: levels.prevWeekLow, livePrice });
  }
  return breaks;
}

/** True when freshly fetched weekly levels differ from cache (week rolled over). */
export function weekRolledOver(cachedWeekHigh: number | null, freshWeekHigh: number | null): boolean {
  return freshWeekHigh != null && String(freshWeekHigh) !== String(cachedWeekHigh);
}
