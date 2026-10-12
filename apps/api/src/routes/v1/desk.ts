// api/routes/v1/desk — read endpoints the browser shell and chart
// workspace consume through the same-origin proxy (no Supabase in web).
import type { FastifyInstance } from 'fastify';
import { latestNotifications, listSignals, listVerdicts } from '../../repositories/repos.js';
import { newsWindowStatus } from '../../services/transitions.js';
import { getCandles, isTimeframe } from '../../services/market.js';
import { getVerdicts } from '../../services/catalog.js';
import { subscriberCount } from '../../plugins/sse.js';
import { apiError } from '../../lib/errors.js';

const STALE_OPEN_HOURS = 48;

export async function deskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/notifications', async (req) => {
    const q = req.query as { limit?: string };
    const rows = await latestNotifications(q.limit ? Number(q.limit) : 20);
    return { notifications: rows };
  });

  app.get('/v1/verdicts/:table', async (req, reply) => {
    const { table } = req.params as { table: string };
    if (table !== 'analysed_signals' && table !== 'news_signals') {
      void reply.code(404).send(apiError('not_found', 'Unknown verdict table.'));
      return;
    }
    const q = req.query as { status?: string; limit?: string };
    return getVerdicts(table, q.status, q.limit ? Number(q.limit) : 100);
  });

  app.get('/v1/desk/status', async () => {
    const [recent, analysed, open, news] = await Promise.all([
      listSignals(undefined, 1),
      listVerdicts('analysed_signals', undefined, 1),
      listSignals('open', 200),
      newsWindowStatus(),
    ]);
    const cutoff = Date.now() - STALE_OPEN_HOURS * 3_600_000;
    const staleOpen = open.filter((s) => new Date(s.created_at).getTime() < cutoff).length;
    return {
      lastSignalAt: recent[0]?.created_at ?? null,
      lastAnalysedAt: analysed[0]?.created_at ?? null,
      openCount: open.length,
      staleOpenCount: staleOpen,
      staleOpenHours: STALE_OPEN_HOURS,
      news,
      stream: { subscribers: subscriberCount() },
    };
  });

  app.get('/v1/market/candles', async (req, reply) => {
    const q = req.query as { tf?: string; bars?: string };
    const tf = isTimeframe(q.tf) ? q.tf : '15m';
    const bars = q.bars ? Number(q.bars) : 300;
    if (!Number.isFinite(bars)) {
      void reply.code(400).send(apiError('bad_request', 'bars must be a number.'));
      return;
    }
    return getCandles(tf, bars);
  });
}
