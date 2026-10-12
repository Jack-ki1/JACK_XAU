// api/providers/twelveData — swappable market-data provider (Twelve Data today).
// All functions return null/[] when the key is missing (disabled, not crash).
import { getEnv } from '../config/env.js';
import { errorMessage } from '../lib/errors.js';
import { readJson } from '../lib/http.js';

export interface TdBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TdValue {
  datetime: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close?: string | number;
}

function num(v: string | number | undefined): number {
  return parseFloat(String(v));
}

export async function fetchBarsSince(fromIso: string, interval: string, key: string | undefined): Promise<TdBar[]> {
  if (!key) return [];
  try {
    const startParam = new Date(fromIso).toISOString().slice(0, 19).replace('T', ' ');
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&start_date=${encodeURIComponent(startParam)}&order=ASC&outputsize=5000&apikey=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await readJson(res);
    if (data?.status === 'error' || !Array.isArray(data?.values)) return [];
    return (data.values as TdValue[])
      .map((v) => ({ time: v.datetime, open: num(v.open), high: num(v.high), low: num(v.low), close: num(v.close) }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  } catch {
    return [];
  }
}

export async function fetchSeriesPaginated(
  interval: string, startDate: string, endDate: string, key: string | undefined,
): Promise<{ bars: TdBar[]; creditsUsed: number }> {
  if (!key) return { bars: [], creditsUsed: 0 };
  const all: TdBar[] = [];
  let cursor = endDate;
  let credits = 0;
  const startTime = new Date(startDate).getTime();
  for (let guard = 0; guard < 40; guard++) {
    try {
      const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&end_date=${encodeURIComponent(cursor)}&order=DESC&outputsize=5000&apikey=${key}`;
      const res = await fetch(url);
      const data = await readJson(res);
      credits++;
      if (data?.status === 'error' || !Array.isArray(data?.values) || data.values.length === 0) break;
      const chunk: TdBar[] = (data.values as TdValue[]).map((v) => ({
        time: String(v.datetime).replace(' ', 'T') + 'Z',
        open: num(v.open), high: num(v.high), low: num(v.low), close: num(v.close),
      }));
      all.push(...chunk);
      const oldest = chunk[chunk.length - 1];
      if (new Date(oldest.time).getTime() <= startTime) break;
      if (chunk.length < 5000) break;
      cursor = new Date(new Date(oldest.time).getTime() - 1000).toISOString().slice(0, 19).replace('T', ' ');
    } catch (e) {
      throw new Error(`Twelve Data fetch failed: ${errorMessage(e)}`);
    }
  }
  const bars = all.filter((b) => new Date(b.time).getTime() >= startTime).sort((a, b) => a.time.localeCompare(b.time));
  return { bars, creditsUsed: credits };
}

export async function fetchSpotPrice(key: string | undefined): Promise<number | null> {
  if (!key) return null;
  try {
    const res = await fetch(`https://api.twelvedata.com/price?symbol=XAU/USD&apikey=${key}`, { signal: AbortSignal.timeout(8000) });
    const data = await readJson(res);
    const price = data.price != null ? parseFloat(String(data.price)) : null;
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

export function resolutionKey(): string | undefined {
  return getEnv().TWELVEDATA_API_KEY_RESOLUTION;
}
export function backtestKey(): string | undefined {
  return getEnv().TWELVEDATA_API_KEY;
}
export function analysisKey(): string | undefined {
  return getEnv().TWELVEDATA_API_KEY_ANALYSED_SIGNALS;
}
