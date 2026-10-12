import type { FastifyInstance } from 'fastify';
import { analyseOneSignal } from '../../services/analysis.js';
import { getSignals, ingestSignal } from '../../services/catalog.js';
import { getSignalBySignalId, listSignalsByIds } from '../../repositories/repos.js';
import { apiError } from '../../lib/errors.js';

export async function signalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/signals', async (req) => {
    const q = req.query as { status?: string; limit?: string; ids?: string };
    if (q.ids) {
      const ids = q.ids.split(',').map((s) => s.trim()).filter(Boolean);
      const rows = await listSignalsByIds(ids);
      return { signals: rows, count: rows.length };
    }
    return getSignals(q.status, q.limit ? Number(q.limit) : 50);
  });

  app.get('/v1/signals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const sig = await getSignalBySignalId(id);
    if (!sig) {
      void reply.code(404).send(apiError('not_found', `No signal ${id}.`));
      return;
    }
    return { signal: sig };
  });

  // Token-guarded ingest for the external producer (main.py / TradingView
  // pipeline). Idempotent on signal_id. This is the documented replacement
  // for "main.py writes Supabase directly" (Phase 0 open decision #1).
  app.post('/v1/signals/ingest', async (req) => ingestSignal(req.body));

  app.post('/v1/signals/:id/analyse', async (req) => {
    const { id } = req.params as { id: string };
    const sig = await getSignalBySignalId(id);
    if (!sig) return { signal_id: id, outcome: 'not_found_yet', note: 'Cron safety net will pick this up once the row exists.' };
    return analyseOneSignal(sig);
  });

  app.post('/v1/signals/analyse', async () => {
    const { analysePending } = await import('../../services/analysis.js');
    return analysePending();
  });
}
