import type { FastifyInstance } from 'fastify';
import { getRun, listRuns, startRun } from '../../services/backtest.js';
import { closedPatterns, performanceSummary } from '../../services/catalog.js';
import { newsStatus } from '../../services/analysis.js';
import { marketStatus } from '../../services/transitions.js';
import { streamHandler } from '../../plugins/sse.js';
import { apiError } from '../../lib/errors.js';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/market/status', async () => marketStatus());
  app.get('/v1/analysis/status', async () => newsStatus());
  app.get('/v1/analysis/closed', async () => closedPatterns());
  app.get('/v1/performance', async () => performanceSummary());

  app.post('/v1/backtests', { config: { rateLimit: { max: 10, timeWindow: '1 day' } } }, async (req, reply) => {
    try {
      const run = await startRun(req.body);
      void reply.code(202).send(run);
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      void reply.code(err.status ?? 500).send(apiError(err.code ?? 'backtest_failed', err.message));
    }
  });
  app.get('/v1/backtests', async () => ({ runs: listRuns() }));
  app.get('/v1/backtests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = getRun(id);
    if (!run) {
      void reply.code(404).send(apiError('not_found', `No backtest ${id}.`));
      return;
    }
    return run;
  });

  app.get('/v1/stream', async (req, reply) => streamHandler(req, reply));
}
