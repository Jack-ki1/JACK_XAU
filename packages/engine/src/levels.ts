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

// ===== v2 expansions (round numbers, distances, confluence) =============

export interface RoundLevelOptions {
  /** Level spacing in dollars (default 10 → 2610, 2620, …). */
  step?: number;
  /** How many levels each side of price to return (default 3). */
  radius?: number;
}

/** Round-number psychological levels bracketing a price (2610, 2620, …). */
export function roundNumberLevels(price: number, options: RoundLevelOptions = {}): number[] {
  const step = options.step ?? 10;
  const radius = options.radius ?? 3;
  if (!(step > 0) || !Number.isFinite(price)) return [];
  const center = Math.round(price / step) * step;
  const levels: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    const level = Math.round((center + i * step) * 100) / 100;
    if (!levels.includes(level)) levels.push(level);
  }
  return levels.sort((a, b) => a - b);
}

export interface NearestLevel {
  level: number;
  /** Absolute distance in points (0.01 units). */
  points: number;
  side: 'above' | 'below' | 'at';
}

/** Nearest level to a price, with signed side and distance in points. */
export function nearestLevel(price: number, levels: Array<number | null | undefined>): NearestLevel | null {
  const valid = levels.filter((l): l is number => typeof l === 'number' && Number.isFinite(l));
  if (valid.length === 0 || !Number.isFinite(price)) return null;
  let best = valid[0]!;
  for (const l of valid) {
    if (Math.abs(l - price) < Math.abs(best - price)) best = l;
  }
  const points = Math.round(Math.abs(best - price) / 0.01);
  const side: NearestLevel['side'] = best > price ? 'above' : best < price ? 'below' : 'at';
  return { level: best, points, side };
}

export interface ConfluenceResult {
  /** How many levels fall within the tolerance band. */
  hits: number;
  /** hits / total levels, 0..1. */
  score: number;
  /** Nearest hit, if any. */
  nearest: NearestLevel | null;
}

/**
 * Level confluence: how crowded a price is with levels inside a tolerance
 * band (points). Used for entry-quality scoring near round numbers/PDH/PWL.
 */
export function levelConfluence(price: number, levels: Array<number | null | undefined>, tolerancePoints: number): ConfluenceResult {
  const valid = levels.filter((l): l is number => typeof l === 'number' && Number.isFinite(l));
  if (valid.length === 0) return { hits: 0, score: 0, nearest: null };
  const tol = Math.max(0, tolerancePoints);
  const hits = valid.filter((l) => Math.round(Math.abs(l - price) / 0.01) <= tol).length;
  return {
    hits,
    score: hits / valid.length,
    nearest: nearestLevel(price, valid),
  };
}
