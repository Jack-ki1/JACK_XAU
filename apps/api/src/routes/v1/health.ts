import type { FastifyInstance } from 'fastify';
import { getEnv, hasDb } from '../../config/env.js';
import { resolutionStatus } from '../../services/resolution.js';
import { backtestStatus } from '../../services/backtest.js';
import { jobStatus } from '../../jobs/scheduler.js';
import { subscriberCount } from '../../plugins/sse.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/health', async () => {
    const e = getEnv();
    return {
      ok: true,
      service: 'jack-trade-api',
      db: hasDb(),
      streamSubscribers: subscriberCount(),
      features: {
        resolution: resolutionStatus(),
        backtest: backtestStatus(),
        llmAnalysis: { enabled: Boolean(e.GROQ_API_KEY_ANALYSED_SIGNALS) },
        newsAnalysis: { enabled: Boolean(e.GROQ_API_KEY_NEWS_SIGNALS) },
        calendar: { enabled: Boolean(e.JBLANKED_API_KEY) },
        jobs: e.JOBS_ENABLED !== 'false',
      },
      jobs: Object.fromEntries(jobStatus),
    };
  });
}
