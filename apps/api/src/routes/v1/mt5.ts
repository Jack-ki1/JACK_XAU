// api/routes/v1/mt5 — v2 C11 MT5 bridge endpoints. The bridge (Windows,
// tools/mt5-bridge) polls the terminal and POSTs a snapshot; the desk reads
// the latest one. Read-only: the API never places orders.
import type { FastifyInstance } from 'fastify';
import { insertMt5Snapshot, latestMt5Snapshot } from '../../repositories/repos.js';
import { apiError } from '../../lib/errors.js';

const MAX_POSITIONS = 50;

export async function mt5Routes(app: FastifyInstance): Promise<void> {
  app.post('/v1/mt5/sync', async (req, reply) => {
    const body = (req.body ?? {}) as {
      account?: Record<string, unknown>;
      positions?: Array<Record<string, unknown>>;
      bridge_status?: string;
    };
    if (!body.account || typeof body.account !== 'object') {
      void reply.code(400).send(apiError('invalid_body', 'account object required.'));
      return;
    }
    const positions = Array.isArray(body.positions) ? body.positions.slice(0, MAX_POSITIONS) : [];
    try {
      await insertMt5Snapshot({ account: body.account, positions, bridge_status: body.bridge_status });
    } catch {
      void reply.code(503).send(apiError('db_unavailable', 'Database not configured — snapshot dropped.'));
      return;
    }
    return { stored: true, positions: positions.length };
  });

  app.get('/v1/mt5/status', async () => {
    const snapshot = await latestMt5Snapshot();
    if (!snapshot) return { connected: false, snapshot: null, note: 'No bridge snapshots yet — start tools/mt5-bridge on the Windows box.' };
    const createdAt = String(snapshot.created_at ?? '');
    const ageMinutes = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 60000 : Number.POSITIVE_INFINITY;
    return {
      connected: ageMinutes < 10,
      ageMinutes: Math.round(ageMinutes),
      snapshot,
    };
  });
}
