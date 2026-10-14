import type { FastifyInstance } from 'fastify';
import { getEnv, hasDb } from '../../config/env.js';
import { resolutionStatus } from '../../services/resolution.js';
import { backtestStatus } from '../../services/backtest.js';
import { jobStatus, jobNames } from '../../jobs/scheduler.js';
import { subscriberCount } from '../../plugins/sse.js';
import { storeFreshness } from '../../services/candles.js';
import { creditSummary } from '../../lib/credits.js';

type Sub = 'ok' | 'degraded' | 'down';

interface DegradationEntry {
  status: Sub;
  detail?: string;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/health', async () => {
    const e = getEnv();
    const freshness = await storeFreshness();
    const credits = await creditSummary();

    // Degradation matrix (v2 C11): what still works when a dependency is off.
    const degradation: Record<string, DegradationEntry> = {
      db: hasDb()
        ? { status: 'ok' }
        : { status: 'down', detail: 'No Supabase credentials — demo/ops-limited mode; ingest and journal disabled.' },
      marketData: e.TWELVEDATA_API_KEY || e.TWELVEDATA_API_KEY_RESOLUTION
        ? { status: 'ok' }
        : { status: 'degraded', detail: 'No TwelveData key — simulated candles only; resolution sweep off.' },
      llmAnalysis: e.GROQ_API_KEY_ANALYSED_SIGNALS
        ? { status: 'ok' }
        : { status: 'degraded', detail: 'No Groq key — verdicts skipped; signals still resolve deterministically.' },
      news: e.GROQ_API_KEY_NEWS_SIGNALS && e.FINNHUB_API_KEY
        ? { status: 'ok' }
        : { status: 'degraded', detail: 'News verdicts/headlines off — calendar-only risk windows.' },
      jobs: e.JOBS_ENABLED !== 'false'
        ? { status: 'ok' }
        : { status: 'degraded', detail: 'Scheduler disabled — trigger jobs manually via POST /v1/jobs/:name.' },
      stream: { status: subscriberCount() > 0 ? 'ok' : 'degraded', detail: subscriberCount() > 0 ? undefined : 'No SSE clients — UI polls.' },
    };

    // Candle store staleness → marketData degrades further.
    const worst = freshness.reduce<{ tf: string; ageMinutes: number | null }>((a, b) =>
      (b.ageMinutes ?? -1) > (a.ageMinutes ?? -1) ? b : a, { tf: '-', ageMinutes: null });
    if (worst.ageMinutes != null && worst.ageMinutes > 60 && degradation.marketData?.status === 'ok') {
      degradation.marketData = { status: 'degraded', detail: `Latest ${worst.tf} candle is ${Math.round(worst.ageMinutes)}m old.` };
    }

    // Credit utilisation → warn before hitting provider caps.
    const entries = Object.entries(credits ?? {});
    const hot = entries.find(([, c]) => c && c.dayLimit > 0 && c.dayUsed / c.dayLimit > 0.8);
    if (hot) {
      degradation.credits = { status: 'degraded', detail: `${hot[0]} at ${hot[1].dayUsed}/${hot[1].dayLimit} today.` };
    } else {
      degradation.credits = { status: 'ok' };
    }

    const overall: Sub = Object.values(degradation).some((d) => d.status === 'down')
      ? 'down'
      : Object.values(degradation).some((d) => d.status === 'degraded')
        ? 'degraded'
        : 'ok';

    return {
      ok: overall !== 'down',
      service: 'jack-trade-api',
      status: overall,
      db: hasDb(),
      streamSubscribers: subscriberCount(),
      degradation,
      features: {
        resolution: resolutionStatus(),
        backtest: backtestStatus(),
        llmAnalysis: { enabled: Boolean(e.GROQ_API_KEY_ANALYSED_SIGNALS) },
        newsAnalysis: { enabled: Boolean(e.GROQ_API_KEY_NEWS_SIGNALS) },
        calendar: { enabled: Boolean(e.JBLANKED_API_KEY) },
        jobs: e.JOBS_ENABLED !== 'false',
      },
      jobs: Object.fromEntries(jobStatus),
      jobsKnown: jobNames(),
      candleFreshness: freshness,
    };
  });
}
