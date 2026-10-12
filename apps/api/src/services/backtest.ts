// api/services/backtest — async runs with progress + history.
// Ports the old POST /api/backtest fetch-all-then-run flow; runs are stored
// in-memory with a bounded history (persisted history table lands in P6).
import { runBacktest, summarize, DEFAULT_PARAMS, type Bar, type BarsByTF, type BacktestParams } from '@jack-trade/engine';
import { backtestRequestSchema } from '@jack-trade/shared';
import { getEnv } from '../config/env.js';
import { backtestKey, fetchSeriesPaginated } from '../providers/twelveData.js';
import { bumpUsage, getUsage } from '../repositories/repos.js';

const DAILY_LIMIT = 800;
const MAX_CONFIGS = 4;
const HISTORY_CAP = 20;

export interface BacktestRun {
  id: string;
  status: 'running' | 'done' | 'error';
  progress: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  results?: unknown;
  meta?: unknown;
  error?: string;
}

const runs = new Map<string, BacktestRun>();

function monthlyToYearly(monthly: Bar[]): Bar[] {
  const byYear = new Map<string, Bar[]>();
  for (const bar of monthly) {
    const year = bar.time.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), bar]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, bars]) => ({
      time: `${year}-01-01T00:00:00Z`,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
    }));
}

export function listRuns(): BacktestRun[] {
  return [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, HISTORY_CAP);
}

export function getRun(id: string): BacktestRun | null {
  return runs.get(id) ?? null;
}

export async function startRun(body: unknown): Promise<BacktestRun> {
  const parsed = backtestRequestSchema.safeParse(body);
  if (!parsed.success) throw Object.assign(new Error('Invalid backtest request.'), { code: 'bad_request', status: 400 });
  if (getEnv().BACKTEST_ENABLED === 'false') throw Object.assign(new Error('Backtesting is disabled.'), { code: 'disabled', status: 403 });
  const key = backtestKey();
  if (!key) throw Object.assign(new Error('TWELVEDATA_API_KEY not set.'), { code: 'backtest_disabled', status: 503 });
  if ((await getUsage('av_usage', 'backtest')) >= DAILY_LIMIT) {
    throw Object.assign(new Error('Daily Twelve Data limit reached.'), { code: 'quota_exceeded', status: 429 });
  }

  const { startDate, endDate } = parsed.data;
  const configs = parsed.data.configs?.length ? parsed.data.configs : [{ name: 'Baseline (current live settings)', params: {} }];
  if (configs.length > MAX_CONFIGS) throw Object.assign(new Error('Maximum 4 configurations per run.'), { code: 'bad_request', status: 400 });

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const run: BacktestRun = { id, status: 'running', progress: 'fetching price data', createdAt: new Date().toISOString(), startDate, endDate };
  runs.set(id, run);

  void (async () => {
    try {
      const [oneMin, fiveMin, fifteenMin, sixtyMin, fourHour, daily, weekly, monthly] = await Promise.all([
        fetchSeriesPaginated('1min', startDate, endDate, key),
        fetchSeriesPaginated('5min', startDate, endDate, key),
        fetchSeriesPaginated('15min', startDate, endDate, key),
        fetchSeriesPaginated('1h', startDate, endDate, key),
        fetchSeriesPaginated('4h', startDate, endDate, key),
        fetchSeriesPaginated('1day', startDate, endDate, key),
        fetchSeriesPaginated('1week', startDate, endDate, key),
        fetchSeriesPaginated('1month', startDate, endDate, key),
      ]);
      const creditsUsed = [oneMin, fiveMin, fifteenMin, sixtyMin, fourHour, daily, weekly, monthly].reduce((s, r) => s + r.creditsUsed, 0);
      if (oneMin.bars.length === 0) throw new Error('No 1-minute price data for this range.');
      const barsByTF: BarsByTF = {
        '1': oneMin.bars, '3': fiveMin.bars, '5': fiveMin.bars, '15': fifteenMin.bars,
        '60': sixtyMin.bars, '240': fourHour.bars, 'D': daily.bars, 'W': weekly.bars,
        'M': monthly.bars, '12M': monthlyToYearly(monthly.bars),
      };
      run.progress = 'simulating';
      const results = configs.map((cfg) => {
        const params: BacktestParams = { ...DEFAULT_PARAMS, ...cfg.params };
        const { signals, diagnostics } = runBacktest(barsByTF, params);
        return { name: cfg.name, params, summary: summarize(signals), signals, diagnostics };
      });
      const used = await bumpUsage('av_usage', 'backtest', creditsUsed);
      run.status = 'done';
      run.progress = 'done';
      run.results = results;
      run.meta = {
        barsCounts: {
          '1m': oneMin.bars.length, '5m': fiveMin.bars.length, '15m': fifteenMin.bars.length,
          '1h': sixtyMin.bars.length, '4h': fourHour.bars.length, D: daily.bars.length,
          W: weekly.bars.length, M: monthly.bars.length,
        },
        oneMinuteRangeActuallyFetched: oneMin.bars.length > 0
          ? { earliest: oneMin.bars[0].time, latest: oneMin.bars[oneMin.bars.length - 1].time }
          : null,
        creditsUsed, used, limit: DAILY_LIMIT,
      };
      if (runs.size > HISTORY_CAP * 2) for (const old of listRuns().slice(HISTORY_CAP)) runs.delete(old.id);
    } catch (e) {
      run.status = 'error';
      run.error = e instanceof Error ? e.message : String(e);
    }
  })();

  return run;
}

export function backtestStatus() {
  const e = getEnv();
  return {
    enabled: e.BACKTEST_ENABLED !== 'false' && Boolean(e.TWELVEDATA_API_KEY),
    reason: e.BACKTEST_ENABLED === 'false' ? 'BACKTEST_ENABLED=false' : e.TWELVEDATA_API_KEY ? undefined : 'TWELVEDATA_API_KEY not set',
    dailyLimit: DAILY_LIMIT,
    history: listRuns().length,
  };
}
